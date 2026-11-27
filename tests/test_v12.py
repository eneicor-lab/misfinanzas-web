from pathlib import Path
import re, unittest
ROOT=Path(__file__).resolve().parents[1]
class TestV12(unittest.TestCase):
 def test_web_android_same(self):
  for n in ('app.html','supabase-dev.html'):
   self.assertEqual((ROOT/'web'/n).read_bytes(),(ROOT/'android/app/src/main/assets'/n).read_bytes())
 def test_read_only_remote(self):
  s=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  self.assertIn("method!=='GET' && path.startsWith('/rest/v1/')",s)
  self.assertIn("$('post').disabled=true",s)
 def test_local_launcher(self):
  s=(ROOT/'INICIAR_MISFINANZAS_DEV.ps1').read_text(encoding='utf-8-sig')
  self.assertIn('http://localhost:$port/',s)
  self.assertIn('StartsWith($root +',s)
  self.assertNotIn('0.0.0.0',s)
 def test_version(self):
  self.assertIn('2.7.0-rc2',(ROOT/'android/app/build.gradle.kts').read_text(encoding='utf-8'))
 def test_no_embedded_credentials(self):
  s=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  self.assertIn('No introducir claves secret/service_role.',s)
  self.assertNotIn('eyJhbGciOi',s)
if __name__=='__main__':unittest.main()
