import hashlib
import pathlib
import re
import subprocess
import tempfile
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
class CandidateChecks(unittest.TestCase):
    def test_web_android_same_html(self):
        a = (ROOT/'web/app.html').read_bytes()
        b = (ROOT/'android/app/src/main/assets/app.html').read_bytes()
        self.assertEqual(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())
    def test_javascript_syntax(self):
        html = (ROOT/'web/app.html').read_text(encoding='utf-8')
        scripts = re.findall(r'<script\b[^>]*>(.*?)</script>', html, re.I|re.S)
        self.assertGreaterEqual(len(scripts), 10)
        for idx, script in enumerate(scripts):
            if not script.strip(): continue
            with tempfile.TemporaryDirectory() as tmp:
                f=pathlib.Path(tmp)/'script.js'; f.write_text(script)
                result=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,f'Script {idx}: {result.stderr}')
    def test_local_demo_and_remote_read_only_boundary(self):
        html = (ROOT/'web/app.html').read_text(encoding='utf-8')
        self.assertIn('DESARROLLO · DATOS LOCALES · NO PRODUCCIÓN',html)
        self.assertNotIn('supabase.co',html)
        self.assertNotIn('fetch(',html)
        self.assertIn('id="mfdev-open" disabled',html)
        remote=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
        self.assertIn("method!=='GET' && path.startsWith('/rest/v1/')",remote)
        self.assertIn('async function postMovement(){throw Error',remote)
        self.assertIn('MF_SAFETY.publicKey(key)',remote)
        self.assertNotIn('eyJhbGciOi',remote)
    def test_android_restricted_permissions(self):
        manifest=(ROOT/'android/app/src/main/AndroidManifest.xml').read_text(encoding='utf-8')
        self.assertIn('android.permission.INTERNET',manifest)
        self.assertIn('android:usesCleartextTraffic="false"',manifest)
        self.assertIn('android:allowBackup="false"',manifest)
    def test_launch_not_exposed(self):
        html=(ROOT/'web/app.html').read_text(encoding='utf-8')
        self.assertNotIn('Lanzar definitiva',html)
if __name__=='__main__': unittest.main()
