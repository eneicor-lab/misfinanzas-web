import pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class SingleOwnerScope(unittest.TestCase):
 def test_dev_diagnostics_not_user_admin(self):
  for f in [ROOT/'web/index.html', ROOT/'android/app/src/main/assets/index.html']:
   s=f.read_text(encoding='utf-8')
   self.assertIn('<h3>Diagnóstico local</h3>',s)
   self.assertNotIn('<h3>Administración de desarrollo</h3>',s)
 def test_scope_documented(self):
  s=(ROOT/'docs/ALCANCE_MONOUSUARIO.md').read_text(encoding='utf-8')
  self.assertIn('Un solo titular',s)
