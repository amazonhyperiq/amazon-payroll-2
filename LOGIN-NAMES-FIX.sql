-- إصلاح ظهور أسماء المانحين في شاشة الدخول
-- لا يحذف أو يعدل أي بيانات.

CREATE OR REPLACE FUNCTION public.get_active_givers_for_login()
RETURNS SETOF public.advance_givers
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.*
  FROM public.advance_givers AS g
  WHERE COALESCE(g.is_active, true) = true
  ORDER BY g.name;
$$;

REVOKE ALL ON FUNCTION public.get_active_givers_for_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_givers_for_login() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
