import pathlib,re,unittest
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]
class IDs(HTMLParser):
 def __init__(self): super().__init__();self.ids=[];self.sections=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.append(a['id'])
  if tag=='section' and 'id' in a:self.sections.append(a['id'])
class NavigationContract(unittest.TestCase):
 def test_sections_and_admin(self):
  html=(ROOT/'web/index.html').read_text(encoding='utf-8');p=IDs();p.feed(html)
  for key in ('inicio','movimientos','planificacion','deudas','ahorros','configuracion','catalogos','administracion','acerca'):
   self.assertIn(key,p.sections)
  self.assertIn('Creado por: Eduardo Neisa Cortés',html)
  self.assertNotIn('Diseñado por: Eduardo Neisa Cortés',html)
 def test_android_back_and_local_only(self):
  java=(ROOT/'android/app/src/main/java/co/misfinanzas/dev/MainActivity.java').read_text(encoding='utf-8')
  self.assertIn('webView.canGoBack()',java)
  self.assertIn('webView.goBack()',java)
  self.assertIn('MIXED_CONTENT_NEVER_ALLOW',java)
  manifest=(ROOT/'android/app/src/main/AndroidManifest.xml').read_text(encoding='utf-8')
  self.assertIn('android.permission.INTERNET',manifest)
  self.assertIn('android:usesCleartextTraffic="false"',manifest)
 def test_single_ui_source(self):
  self.assertEqual((ROOT/'web/index.html').read_bytes(),(ROOT/'android/app/src/main/assets/index.html').read_bytes())
if __name__=='__main__':unittest.main()
