"""Build a recoverable source package from the checked-out public candidate only."""
import hashlib,json,pathlib,re,subprocess,zipfile,os
root=pathlib.Path(__file__).resolve().parents[1]
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
prefixes=('web/','android/','sql/','tests/','tools/')
fixed={'package.json','playwright.config.cjs','.github/workflows/qa-rc2.yml','.github/workflows/respaldo-misfinanzas.yml','docs/ALCANCE_MONOUSUARIO.md','docs/QA_CANDIDATA.csv','INICIAR_MISFINANZAS_DEV.ps1','INICIAR_MISFINANZAS_DEV.cmd','MISFINANZAS_CHECKPOINT_REINICIO.md'}
files=sorted(p for p in tracked if p and (p.startswith(prefixes) or p.startswith('.github/workflows/') or p in fixed))
apk_commit=os.environ['MF_TESTED_APK_COMMIT']
if not re.fullmatch(r'[a-f0-9]{40}',apk_commit):raise SystemExit('Verified APK commit required')
subprocess.run(['git','diff','--exit-code',apk_commit,'HEAD','--','web','android'],cwd=root,check=True)
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY',rb'\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}',rb'\bsb_secret_[A-Za-z0-9_-]{12,}']
manifest=[]
for name in files:
 data=(root/name).read_bytes()
 if any(re.search(pattern,data) for pattern in patterns):raise SystemExit('Private credential pattern found in '+name)
 manifest.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
out=root/'artifacts';out.mkdir(exist_ok=True)
name='MisFinanzas-2.7.0-rc2-'+commit[:12]+'-source.zip'
manifest_bytes=json.dumps({'version':'2.7.0-rc2','commit':commit,'tested_apk_app_commit':apk_commit,'initial_candidate_zip_sha256':'e42bdbce71bb734dc1b4800a017501c935c58b5bf4ee2abe538773b219be5c7d','files':manifest},ensure_ascii=False,indent=2).encode()
(out/'MANIFIESTO_SHA256.json').write_bytes(manifest_bytes)
(out/'SOURCE_COMMIT.txt').write_text(commit+'\n')
(out/'APK_APP_PARITY.txt').write_text('PASS web/android application files equal to tested APK commit '+apk_commit+'\nSource package commit '+commit+'\n')
with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED) as z:
 for entry in manifest:z.write(root/entry['path'],entry['path'])
 z.writestr('MANIFIESTO_SHA256.json',manifest_bytes)
 z.writestr('SOURCE_COMMIT.txt',commit+'\n')
 z.writestr('APK_APP_PARITY.txt',(out/'APK_APP_PARITY.txt').read_text())
with zipfile.ZipFile(out/name) as z:
 for entry in manifest:assert hashlib.sha256(z.read(entry['path'])).hexdigest()==entry['sha256']
digest=hashlib.sha256((out/name).read_bytes()).hexdigest()
(out/'SOURCE_SHA256SUMS.txt').write_text(digest+'  '+name+'\n')
print('PASS source archive re-read and manifest verification: '+str(len(manifest))+' files')
print(digest+'  '+name)

web_name='MisFinanzas-2.7.0-rc2-'+commit[:12]+'-web.zip'
web_entries=[entry for entry in manifest if entry['path'].startswith('web/')]
web_manifest={'version':'2.7.0-rc2','commit':commit,'files':[{**entry,'path':entry['path'][4:]} for entry in web_entries]}
with zipfile.ZipFile(out/web_name,'w',zipfile.ZIP_DEFLATED) as z:
 for entry in web_entries:z.write(root/entry['path'],entry['path'][4:])
 z.writestr('MANIFIESTO_WEB_SHA256.json',json.dumps(web_manifest,ensure_ascii=False,indent=2))
 z.writestr('WEB_COMMIT.txt',commit+'\n')
with zipfile.ZipFile(out/web_name) as z:
 assert 'index.html' in z.namelist()
 for entry in web_entries:assert hashlib.sha256(z.read(entry['path'][4:])).hexdigest()==entry['sha256']
web_digest=hashlib.sha256((out/web_name).read_bytes()).hexdigest()
with (out/'SOURCE_SHA256SUMS.txt').open('a') as f:f.write(web_digest+'  '+web_name+'\n')
print('PASS web root archive re-read, index.html and resource hashes')
print(web_digest+'  '+web_name)
