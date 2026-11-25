import pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class AboutTests(unittest.TestCase):
 def test_about_is_navigable(self):
  h=(ROOT/'web/index.html').read_text(encoding='utf-8'); self.assertIn("['acerca','info','Acerca de']",h);self.assertIn('id="acerca"',h)
 def test_author_credit(self):
  h=(ROOT/'web/index.html').read_text(encoding='utf-8');self.assertIn('Creado por: Eduardo Neisa Cortés',h)
 def test_no_false_security_claim(self):
  h=(ROOT/'web/index.html').read_text(encoding='utf-8');self.assertIn('Prototipo demostrativo',h)
if __name__=='__main__':unittest.main()
