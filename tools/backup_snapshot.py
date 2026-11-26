"""Consistent read-only financial/Auth export. Output directory is PRIVATE until encrypted.

PG* variables use libpq; PGCLIENT_CONTAINER optionally selects the PG client container.
No production grants are changed and no secret/snapshot contents are logged.
"""
import hashlib,json,os,re,subprocess,sys
from pathlib import Path

def command(binary,*args):
    container=os.environ.get('PGCLIENT_CONTAINER')
    prefix=['docker','exec','-i'] if container else []
    if container:
        for key in ('PGPASSWORD','PGHOST','PGPORT','PGUSER','PGDATABASE','PGSSLMODE','PGSSLROOTCERT'):
            if key in os.environ:prefix+=['-e',key]
        prefix+=[container]
    return prefix+[binary,*args]

def main():
    target=Path(sys.argv[1]);target.mkdir(mode=0o700,parents=True,exist_ok=False)
    held=subprocess.Popen(command('psql','-X','-qAt','-v','ON_ERROR_STOP=1'),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    try:
        held.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n');held.stdin.flush()
        snapshot=held.stdout.readline().strip()
        if not re.fullmatch(r'[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9A-Fa-f]+',snapshot):raise RuntimeError('Read-only snapshot export failed')
        with (target/'financial.dump').open('wb') as out:
            subprocess.run(command('pg_dump','--format=custom','--schema=public','--schema=mf_next','--enable-row-security','--snapshot='+snapshot),stdout=out,check=True)
        sql="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '"+snapshot+"'; SELECT mf_next.backup_auth_snapshot(); COMMIT;"
        result=subprocess.run(command('psql','-X','-qAt','-v','ON_ERROR_STOP=1'),input=sql,text=True,capture_output=True)
        if result.returncode:raise RuntimeError('Protected Auth snapshot failed; no archive may be published')
        auth=json.loads(result.stdout)
        (target/'auth-source.json').write_text(json.dumps(auth,separators=(',',':')),encoding='utf-8')
        held.stdin.write('COMMIT;\n\\q\n');held.stdin.flush();held.communicate(timeout=15)
        if held.returncode:raise RuntimeError('Snapshot holder failed')
        manifest={'format':1,'consistent_financial_auth_snapshot':True,'schemas':['public','mf_next'],'auth_sessions_excluded':True,'external_auth_configuration_required':True,'files':{}}
        for p in sorted(target.iterdir()):
            manifest['files'][p.name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
        (target/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
        print('PASS consistent financial/Auth read-only snapshot; private payload requires encryption before transfer')
    finally:
        if held.poll() is None:held.terminate();held.wait(timeout=15)
if __name__=='__main__':main()
