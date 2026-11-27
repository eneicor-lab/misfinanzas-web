from pathlib import Path
import unittest, re, subprocess
ROOT=Path(__file__).resolve().parents[1]
class Integration(unittest.TestCase):
 def test_web_android_identical(self):
  self.assertEqual((ROOT/'web/supabase-dev.html').read_bytes(),(ROOT/'android/app/src/main/assets/supabase-dev.html').read_bytes())
 def test_writes_blocked_in_client(self):
  t=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  self.assertIn("if(method!=='GET' && path.startsWith('/rest/v1/'))throw Error",t)
  self.assertIn("async function postMovement(){throw Error",t)
 def test_response_consistency(self):
  t=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  for s in ('map.size!==accounts.length','!map.has(a.id)','Movimiento con importe inválido'):
   self.assertIn(s,t)
 def test_rls_and_grants(self):
  t=(ROOT/'sql/001_ledger_isolated.sql').read_text(encoding='utf-8')
  for s in ('FORCE ROW LEVEL SECURITY','REVOKE ALL ON ALL TABLES','owner_id=(select auth.uid())','UNIQUE(owner_id,idempotency_key)','SECURITY DEFINER'):
   self.assertIn(s,t)
 def test_js_parses(self):
  t=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  scripts=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',t,re.S)
  self.assertTrue(scripts)
  for script in scripts:
   p=subprocess.run(['node','--check','-'],input=script,text=True,capture_output=True)
   self.assertEqual(p.returncode,0,p.stderr)
if __name__=='__main__':unittest.main()
