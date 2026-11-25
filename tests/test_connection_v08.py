from pathlib import Path
import unittest
P=Path(__file__).resolve().parents[1]
class ConnectionV08(unittest.TestCase):
 def test_shared_html(self):
  for f in ('index.html','supabase-dev.html'):
   self.assertEqual((P/'web'/f).read_bytes(),(P/'android/app/src/main/assets'/f).read_bytes())
 def test_info_unique(self):
  s=(P/'web/index.html').read_text(encoding='utf-8')
  self.assertIn("['acerca','info','Acerca de']",s)
  self.assertIn('"info": "<svg',s)
  self.assertIn('M12 16v-4',s)
 def test_online_rpc(self):
  s=(P/'web/supabase-dev.html').read_text(encoding='utf-8')
  self.assertIn('async function postMovement(){throw Error',s)
  self.assertIn("method!=='GET' && path.startsWith('/rest/v1/')",s)
  self.assertIn('/auth/v1/token?grant_type=password',s)
 def test_explicit_dev_guard(self):
  s=(P/'web/index.html').read_text(encoding='utf-8')
  self.assertIn('id="mfdev-confirm"',s)
  self.assertIn('id="mfdev-open" disabled',s)
 def test_android_internet(self):
  self.assertIn('android.permission.INTERNET',(P/'android/app/src/main/AndroidManifest.xml').read_text(encoding='utf-8'))
if __name__=='__main__': unittest.main()
