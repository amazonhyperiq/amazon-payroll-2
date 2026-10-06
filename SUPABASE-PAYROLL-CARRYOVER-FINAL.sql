-- Amazon Advances: final payroll carryover schema correction
-- This fixes the previously-created carryover table to use UUID employee IDs.
-- It does not delete employee, salary, advance, leave, or penalty records.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='advance_carryovers'
      AND column_name='employee_id' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE public.advance_carryovers
      ALTER COLUMN employee_id TYPE uuid USING employee_id::text::uuid;
  END IF;
END $$;

ALTER TABLE public.advance_carryovers
  ALTER COLUMN source_advance_id TYPE text USING source_advance_id::text,
  ALTER COLUMN source_salary_id TYPE text USING source_salary_id::text;

ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_salaries_select" ON public.employee_salaries;
CREATE POLICY "employee_salaries_select" ON public.employee_salaries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "employee_salaries_insert" ON public.employee_salaries;
CREATE POLICY "employee_salaries_insert" ON public.employee_salaries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "employee_salaries_update" ON public.employee_salaries;
CREATE POLICY "employee_salaries_update" ON public.employee_salaries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "employee_salaries_delete" ON public.employee_salaries;
CREATE POLICY "employee_salaries_delete" ON public.employee_salaries FOR DELETE TO anon, authenticated USING (true);

ALTER TABLE public.advance_carryovers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advance_carryovers_select" ON public.advance_carryovers;
CREATE POLICY "advance_carryovers_select" ON public.advance_carryovers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "advance_carryovers_insert" ON public.advance_carryovers;
CREATE POLICY "advance_carryovers_insert" ON public.advance_carryovers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "advance_carryovers_update" ON public.advance_carryovers;
CREATE POLICY "advance_carryovers_update" ON public.advance_carryovers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "advance_carryovers_delete" ON public.advance_carryovers;
CREATE POLICY "advance_carryovers_delete" ON public.advance_carryovers FOR DELETE TO anon, authenticated USING (true);

-- Notification trigger for employee/giver changes only; salary/leave/penalty actions are emitted by the app.
CREATE OR REPLACE FUNCTION public.queue_people_push_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE action_text text; person_name text;
BEGIN
  action_text := CASE TG_OP WHEN 'INSERT' THEN 'إضافة' WHEN 'UPDATE' THEN 'تعديل' ELSE 'حذف' END;
  person_name := COALESCE(NEW.name, OLD.name, 'بيانات');
  INSERT INTO public.advance_push_events(event_type,title,body)
  VALUES (TG_TABLE_NAME || '_' || lower(TG_OP), 'تحديث بيانات ' || CASE WHEN TG_TABLE_NAME='employees' THEN 'موظف' ELSE 'مانح سلفة' END,
          action_text || ' — ' || person_name);
  RETURN COALESCE(NEW,OLD);
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_employees_push_event' AND tgrelid='public.employees'::regclass) THEN
    CREATE TRIGGER trg_employees_push_event AFTER INSERT OR UPDATE OR DELETE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.queue_people_push_event();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_givers_push_event' AND tgrelid='public.advance_givers'::regclass) THEN
    CREATE TRIGGER trg_givers_push_event AFTER INSERT OR UPDATE OR DELETE ON public.advance_givers FOR EACH ROW EXECUTE FUNCTION public.queue_people_push_event();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';


-- =========================================================
-- إصلاح قائمة أسماء المانحين في شاشة الدخول
-- تستخدم SECURITY DEFINER حتى لا تتأثر القائمة بسياسة RLS
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_active_givers_for_login()
RETURNS SETOF public.advance_givers
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.*
  FROM public.advance_givers AS g
  WHERE g.is_active = true
  ORDER BY g.name;
$$;

REVOKE ALL ON FUNCTION public.get_active_givers_for_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_givers_for_login() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
