-- إصلاح آمن لمشكلة RLS عند إنشاء حدث الإشعار وإرجاع معرّفه.
-- السبب: INSERT ... SELECT('id') قد يُرفض إذا لم توجد سياسة SELECT،
-- رغم أن سياسة INSERT تسمح بإنشاء السجل.
-- هذه الدالة تُدخل الحدث ثم تعيد معرّف الحدث الذي أنشأته فقط.

CREATE OR REPLACE FUNCTION public.create_advance_push_event(
  p_event_type text,
  p_title text,
  p_body text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id bigint;
BEGIN
  INSERT INTO public.advance_push_events (event_type, title, body)
  VALUES (
    left(coalesce(nullif(trim(p_event_type), ''), 'system_event'), 120),
    left(coalesce(nullif(trim(p_title), ''), 'إشعار النظام'), 250),
    left(coalesce(p_body, ''), 5000)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- منع الوصول الافتراضي ثم السماح للتطبيق الذي يستخدم anon/authenticated فقط.
REVOKE ALL ON FUNCTION public.create_advance_push_event(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_advance_push_event(text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.create_advance_push_event(text, text, text)
IS 'Creates one push event and returns only its new ID to avoid INSERT RETURNING being blocked by SELECT RLS.';
