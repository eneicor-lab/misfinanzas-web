-- Empty trigger target and used sequence exercise restoration beyond existing rows.
CREATE SEQUENCE mf_next.qa_restore_sequence START WITH 37;
SELECT nextval('mf_next.qa_restore_sequence'),nextval('mf_next.qa_restore_sequence');
CREATE TABLE mf_next.qa_restore_trigger(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,checked boolean NOT NULL DEFAULT false);
CREATE FUNCTION mf_next.qa_restore_mark() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN NEW.checked:=true;RETURN NEW;END $$;
CREATE TRIGGER qa_restore_mark BEFORE INSERT ON mf_next.qa_restore_trigger FOR EACH ROW EXECUTE FUNCTION mf_next.qa_restore_mark();
