from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class SecurityV22(unittest.TestCase):
 def test_remote_arrays_checked_before_use(self):
  s=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  for x in ("if(!Array.isArray(accounts)||!Array.isArray(rows))", "if(map.size!==rows.length", "if(!Array.isArray(batch))throw Error('Página de movimientos inválida')", "if(!Array.isArray(latestEvents))", "Movimiento referencia cuenta inexistente", "n<=0"):
   self.assertIn(x,s)
 def test_android_matches_web(self):
  self.assertEqual((ROOT/'web/supabase-dev.html').read_bytes(),(ROOT/'android/app/src/main/assets/supabase-dev.html').read_bytes())
