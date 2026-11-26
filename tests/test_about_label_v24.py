from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class AboutLabel(unittest.TestCase):
 def test_both_interfaces(self):
  for rel in ("web/app.html", "android/app/src/main/assets/app.html"):
   with self.subTest(rel=rel):
    s=(ROOT/rel).read_text(encoding="utf-8")
    self.assertIn("Creado por",s)
    self.assertNotIn("Diseñado por",s)
if __name__=="__main__":unittest.main()
