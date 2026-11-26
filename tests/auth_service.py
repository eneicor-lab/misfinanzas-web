"""Real GoTrue + captured SMTP; synthetic identities only; never log tokens or passwords."""
import html,json,re,sys,time,urllib.request,urllib.error,urllib.parse
from pathlib import Path
EMAIL='synthetic-owner@example.invalid';FIRST='Synthetic+Password!123';SECOND='Synthetic+Changed!456';THIRD='Synthetic+Recovered!789'
def request(base,path,body=None,token=None,method=None):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    req=urllib.request.Request(base+path,None if body is None else json.dumps(body).encode(),headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=15) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:
        try:data=json.load(e)
        except Exception:data={}
        return e.code,data
def wait_health(base):
    for _ in range(60):
        try:
            if request(base,'/health')[0]==200:return
        except (urllib.error.URLError,TimeoutError):pass
        time.sleep(1)
    raise RuntimeError('Isolated Auth service did not become healthy')
def mail_token(kind,base):
    for _ in range(30):
        _,data=request('http://127.0.0.1:8025','/api/v1/messages')
        for message in data.get('messages',[]):
            _,detail=request('http://127.0.0.1:8025','/api/v1/message/'+message['ID'])
            content=html.unescape(detail.get('HTML','')+' '+detail.get('Text',''))
            for url in re.findall(r'https?://[^\s<>"\)]+',content):
                query=urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
                if url.startswith(base+'/') and query.get('type')==[kind] and query.get('token'):
                    return query['token'][0]
        time.sleep(1)
    raise RuntimeError('Expected verification email was not delivered to isolated SMTP')
def login(base,password):
    code,data=request(base,'/token?grant_type=password',{'email':EMAIL,'password':password})
    if code!=200 or not data.get('access_token') or not data.get('user',{}).get('email_confirmed_at'):raise RuntimeError('Verified identity login failed: HTTP '+str(code))
    return data
base=sys.argv[2] if len(sys.argv)>2 else 'http://127.0.0.1:9999';mode=sys.argv[1];wait_health(base)
if mode=='source':
    for bad in ['short','abcdefghijklmnop','UPPERCASE123!']:
        code,_=request(base,'/signup',{'email':EMAIL,'password':bad})
        if code not in(400,422):raise RuntimeError('Auth server password policy did not reject invalid password')
    code,data=request(base,'/signup',{'email':EMAIL,'password':FIRST})
    if code not in(200,201) or data.get('access_token'):raise RuntimeError('Email verification was bypassed or signup failed: '+str(code))
    code,_=request(base,'/token?grant_type=password',{'email':EMAIL,'password':FIRST})
    if code==200:raise RuntimeError('Unverified email signed in')
    confirmation=mail_token('signup',base);code,verified=request(base,'/verify',{'token_hash':confirmation,'type':'signup'})
    if code!=200 or not verified.get('user',{}).get('email_confirmed_at'):raise RuntimeError('SMTP confirmation failed')
    if request(base,'/verify',{'token_hash':confirmation,'type':'signup'})[0]==200:raise RuntimeError('Confirmation token reused')
    active=login(base,FIRST)
    if request(base,'/user',token=active['access_token'])[0]!=200:raise RuntimeError('Authenticated user lookup failed')
    time.sleep(1.1)
    if request(base,'/recover',{'email':EMAIL})[0]not in(200,202):raise RuntimeError('Password recovery request failed')
    recovery=mail_token('recovery',base);code,session=request(base,'/verify',{'token_hash':recovery,'type':'recovery'})
    if code!=200:raise RuntimeError('Recovery verification failed')
    if request(base,'/user',{'password':SECOND},session['access_token'],method='PUT')[0]!=200:raise RuntimeError('Recovered password update failed')
    if request(base,'/token?grant_type=password',{'email':EMAIL,'password':FIRST})[0]==200:raise RuntimeError('Old password remained valid after recovery')
    fresh=login(base,SECOND);Path('evidence/auth-private-session.json').write_text(json.dumps(fresh))
    print('PASS real Auth: server password complexity, verified signup, single-use SMTP confirmation, login and email recovery')
elif mode=='restored':
    old=json.loads(Path('evidence/auth-private-session.json').read_text())
    if request(base,'/user',token=old['access_token'])[0]==200:raise RuntimeError('Previous deployment token accepted after isolated recovery epoch change')
    if request(base,'/token?grant_type=refresh_token',{'refresh_token':old['refresh_token']})[0]==200:raise RuntimeError('Excluded refresh session resurrected')
    active=login(base,SECOND)
    if active['user']['id']!=old['user']['id']:raise RuntimeError('Auth identity changed during recovery')
    if request(base,'/logout',token=active['access_token'],method='POST')[0]not in(200,204):raise RuntimeError('Auth logout failed')
    if request(base,'/token?grant_type=refresh_token',{'refresh_token':active['refresh_token']})[0]==200:raise RuntimeError('Logout did not revoke refresh session')
    Path('evidence/real-auth-result.txt').write_text('PASS real GoTrue verified signup, strong password policy, SMTP confirmation/recovery, restored identity/password login, prior-token epoch rejection, absent refresh sessions and logout revocation.\nQA only; production provider/JWT/SMTP deployment still requires supervisor approval.\n')
    print('PASS real restored Auth: original identity/password works; prior tokens, excluded sessions and revoked refresh tokens rejected')
else:raise RuntimeError('Unknown isolated Auth mode')
