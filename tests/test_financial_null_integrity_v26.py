from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class FinancialNullIntegrity(unittest.TestCase):
 def test_account_opening_balance_not_null(self):
  s=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  self.assertIn("a.opening_balance===null",s)
  self.assertIn("a.opening===null",s)
 def test_movement_amount_not_null(self):
  s=(ROOT/'web/supabase-dev.html').read_text(encoding='utf-8')
  self.assertIn("e.amount===null",s)
  self.assertIn("r.balance===null",s)
 def test_sql_rejects_invalid_opening(self):
  s=(ROOT/'sql/001_ledger_isolated.sql').read_text(encoding='utf-8')
  self.assertIn('CHECK(opening_balance>=0)',s)
  self.assertIn('p_opening_balance IS NULL',s)
 def test_mobile_connector_matches_web(self):
  self.assertEqual((ROOT/'web/supabase-dev.html').read_bytes(),(ROOT/'android/app/src/main/assets/supabase-dev.html').read_bytes())
