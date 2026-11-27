-- Non-destructive containment; keep all financial history and allow owner reads.
BEGIN;
UPDATE mf_next.feature_flags SET enabled=false WHERE feature='book_sync';
COMMIT;
