"""Private, encrypted artifact storage. No sharing, deletion or secret values in logs."""
import hashlib,json,os,urllib.parse,urllib.request,urllib.error,uuid
from pathlib import Path

class Drive:
    def __init__(self):
        form=urllib.parse.urlencode({k:os.environ[e] for k,e in [('client_id','GOOGLE_CLIENT_ID'),('client_secret','GOOGLE_CLIENT_SECRET'),('refresh_token','GOOGLE_REFRESH_TOKEN')]}|{'grant_type':'refresh_token'}).encode()
        self.token=json.loads(self._http('https://oauth2.googleapis.com/token',form,{'Content-Type':'application/x-www-form-urlencoded'}))['access_token']
    def _http(self,url,data=None,headers=None,method=None):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,data,headers or {},method=method),timeout=90) as r:return r.read()
        except urllib.error.HTTPError as e:raise RuntimeError('Private Drive request rejected HTTP '+str(e.code)) from None
    def request(self,url,data=None,headers=None,method=None):return self._http(url,data,{'Authorization':'Bearer '+self.token,**(headers or {})},method)
    def find(self,query):
        url='https://www.googleapis.com/drive/v3/files?'+urllib.parse.urlencode({'q':query,'fields':'files(id,name,appProperties,webViewLink),nextPageToken','pageSize':100})
        r=json.loads(self.request(url))
        if r.get('nextPageToken'):raise RuntimeError('Ambiguous private artifact inventory; pagination required before mutation')
        return r.get('files',[])
    def private_folder(self,name,purpose):
        if not all(c.isalnum() or c in ' -_' for c in name+purpose):raise ValueError('Invalid private folder selector')
        found=self.find("trashed=false and mimeType='application/vnd.google-apps.folder' and name='"+name+"' and appProperties has {key='application' and value='MisFinanzas'} and appProperties has {key='purpose' and value='"+purpose+"'}")
        if len(found)>1:raise RuntimeError('Duplicate private folders; no overwrite permitted')
        if found:folder=found[0]
        else:folder=json.loads(self.request('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',json.dumps({'name':name,'mimeType':'application/vnd.google-apps.folder','appProperties':{'application':'MisFinanzas','purpose':purpose}}).encode(),{'Content-Type':'application/json'}))
        metadata=json.loads(self.request('https://www.googleapis.com/drive/v3/files/'+folder['id']+'?fields=id,permissions(type,role),webViewLink'))
        permissions=metadata.get('permissions')
        if not permissions or any(p.get('role')!='owner' or p.get('type')!='user' for p in permissions):raise RuntimeError('Private folder permissions not verified as owner-only')
        return metadata
    def download(self,item):
        metadata=json.loads(self.request('https://www.googleapis.com/drive/v3/files/'+item['id']+'?fields=permissions(type,role)'))
        if not metadata.get('permissions') or any(p.get('role')!='owner' or p.get('type')!='user' for p in metadata['permissions']):raise RuntimeError('Encrypted artifact is not verified as owner-only')
        data=self.request('https://www.googleapis.com/drive/v3/files/'+item['id']+'?alt=media')
        expected=item.get('appProperties',{}).get('cipher_sha256')
        if not expected or hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Private encrypted artifact integrity mismatch')
        return data
    def put_new(self,folder,name,data,purpose):
        if not name.endswith('.gpg'):raise RuntimeError('Only encrypted artifacts may be uploaded')
        existing=self.find("trashed=false and '"+folder['id']+"' in parents and name='"+name.replace("'","\\'")+"'")
        if existing:raise RuntimeError('Private artifact exists; overwrite is prohibited')
        digest=hashlib.sha256(data).hexdigest();boundary=uuid.uuid4().hex
        metadata={'name':name,'parents':[folder['id']],'appProperties':{'application':'MisFinanzas','purpose':purpose,'cipher_sha256':digest}}
        body=(f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'.encode()+json.dumps(metadata).encode()+f'\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+data+f'\r\n--{boundary}--\r\n'.encode())
        item=json.loads(self.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,appProperties',body,{'Content-Type':'multipart/related; boundary='+boundary}))
        if self.download(item)!=data:raise RuntimeError('Uploaded artifact readback mismatch')
        return item

if __name__=='__main__':
    import sys
    if len(sys.argv)!=4:raise SystemExit('Usage: private_drive.py get-or-create-signing ENCRYPTED_FILE PRIVATE_RECEIPT')
    _,operation,file,receipt=sys.argv
    if operation!='get-or-create-signing':raise SystemExit('Unsupported operation')
    drive=Drive();folder=drive.private_folder('MisFinanzas - Firma Android','android-signing-v1')
    name='MisFinanzas_android_release_signing_v1.tar.gz.gpg';found=drive.find("trashed=false and '"+folder['id']+"' in parents and name='"+name+"'")
    if len(found)>1:raise RuntimeError('Duplicate signing identities; no automatic replacement')
    target=Path(file)
    if found:item=found[0];target.write_bytes(drive.download(item));mode='reused'
    elif target.exists():item=drive.put_new(folder,name,target.read_bytes(),'android-signing-v1');mode='created'
    else:Path(receipt).write_text(json.dumps({'state':'missing','folder_private':True}));raise SystemExit(0)
    Path(receipt).write_text(json.dumps({'state':mode,'cipher_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'private_file':item},indent=2))
    print('PASS private encrypted signing archive '+mode+', readback verified; no secret values logged')
