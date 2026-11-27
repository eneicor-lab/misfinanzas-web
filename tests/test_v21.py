import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class SafetyV21(unittest.TestCase):
 def test_connectors_identical(self):
  self.assertEqual((ROOT/'web/supabase-dev.html').read_bytes(),(ROOT/'android/app/src/main/assets/supabase-dev.html').read_bytes())
 def test_write_blocked(self):
  s=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  self.assertIn("method!=='GET' && path.startsWith('/rest/v1/')",s)
  self.assertIn("$('post').disabled=true",s)
  self.assertNotIn('mf_post_basic',s)
 def test_atomic_commit(self):
  s=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  self.assertIn('accountList=nextAccounts;balances=b;events=latestEvents',s)
  self.assertIn('accountList=nextAccounts;balances=map;events=all.map',s)
 def test_readonly_audit(self):
  s=(ROOT/'sql/002_security_inventory_read_only.sql').read_text(encoding='utf-8').upper()
  self.assertNotIn('CREATE TABLE',s)
  self.assertNotIn('DROP TABLE',s)
  self.assertNotIn('DELETE FROM',s)
if __name__=='__main__':unittest.main()
