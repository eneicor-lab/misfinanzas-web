"""Build a recoverable source package from the checked-out public candidate only."""
import hashlib,json,pathlib,re,subprocess,zipfile
root=pathlib.Path(__file__).resolve().parents[1]
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
prefixes=('web/','android/','sql/','tests/','tools/')
fixed={'package.json','playwright.config.cjs','.github/workflows/qa-rc2.yml','docs/ALCANCE_MONOUSUARIO.md','INICIAR_MISFINANZAS_DEV.ps1','INICIAR_MISFINANZAS_DEV.cmd','MISFINANZAS_CHECKPOINT_REINICIO.md'}
files=sorted(p for p in tracked if p and (p.startswith(prefixes) or p in fixed))
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY',rb'\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}',rb'\bsb_secret_[A-Za-z0-9_-]{12,}']
manifest=[]
for name in files:
 data=(root/name).read_bytes()
 if any(re.search(pattern,data) for pattern in patterns):raise SystemExit('Private credential pattern found in '+name)
 manifest.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
out=root/'artifacts';out.mkdir(exist_ok=True)
name='MisFinanzas-2.7.0-rc2-'+commit[:12]+'-source.zip'
manifest_bytes=json.dumps({'version':'2.7.0-rc2','commit':commit,'files':manifest},ensure_ascii=False,indent=2).encode()
(out/'MANIFIESTO_SHA256.json').write_bytes(manifest_bytes)
(out/'SOURCE_COMMIT.txt').write_text(commit+'\n')
with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED) as z:
 for entry in manifest:z.write(root/entry['path'],entry['path'])
 z.writestr('MANIFIESTO_SHA256.json',manifest_bytes)
 z.writestr('SOURCE_COMMIT.txt',commit+'\n')
with zipfile.ZipFile(out/name) as z:
 for entry in manifest:assert hashlib.sha256(z.read(entry['path'])).hexdigest()==entry['sha256']
digest=hashlib.sha256((out/name).read_bytes()).hexdigest()
(out/'SOURCE_SHA256SUMS.txt').write_text(digest+'  '+name+'\n')
print('PASS source archive re-read and manifest verification: '+str(len(manifest))+' files')
print(digest+'  '+name)
