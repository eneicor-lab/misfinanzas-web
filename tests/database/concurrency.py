"""Real concurrent SQL sessions on the synthetic localhost CI database only."""
import os, subprocess, time, uuid
assert os.environ.get('PGHOST') == 'localhost', 'Only isolated localhost database is permitted'
OWNER='11111111-1111-4111-8111-111111111111'
PREFIX=f"SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{OWNER}',false);"
def sql(text):
    return subprocess.run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-c',text],capture_output=True,text=True)
created=sql(PREFIX+"SELECT mf_next.create_account('Concurrency synthetic','bank',100)")
assert created.returncode==0, created.stderr
account=created.stdout.strip().splitlines()[-1]
def expense(key,amount):
    return f"SELECT mf_next.post_movement('{key}','expense','{account}',null,{amount},'Concurrent synthetic','2026-01-01');"
first=subprocess.Popen(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-c',"BEGIN;"+PREFIX+expense(uuid.uuid4(),80)+"SELECT pg_sleep(2);COMMIT;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
time.sleep(.5)
second=sql(PREFIX+expense(uuid.uuid4(),80))
out,err=first.communicate(timeout=15)
assert first.returncode==0,err
assert second.returncode!=0 and 'Insufficient funds' in second.stderr,second.stderr
balance=sql(PREFIX+f"SELECT balance FROM mf_next.my_balances() WHERE account_id='{account}'")
assert balance.stdout.strip().splitlines()[-1]=='20',balance.stdout
key=uuid.uuid4()
one=sql(PREFIX+expense(key,10));two=sql(PREFIX+expense(key,10))
assert one.returncode==two.returncode==0,(one.stderr,two.stderr)
assert one.stdout==two.stdout,'Idempotent replay changed identity'
print('PASS concurrent overdrafts serialize; balance remains nonnegative; committed replay remains idempotent')
