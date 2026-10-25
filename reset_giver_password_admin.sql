-- إصلاح نهائي لإعادة تعيين كلمة مرور المانح بواسطة المدير
create extension if not exists pgcrypto;

create or replace function public.advance_manager_reset_giver_password(
  p_giver_id uuid,
  p_manager_password text,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  password_column text;
  affected_rows integer;
begin
  -- كلمة المرور الجديدة: 6 أرقام فقط أو 6 خانات أرقام/حروف إنجليزية مع وجود رقم.
  if p_new_password is null
     or not (p_new_password ~ '^([0-9]{6}|(?=[A-Za-z0-9]{6}$)[A-Za-z0-9]*[0-9][A-Za-z0-9]*)$') then
    raise exception 'كلمة المرور يجب أن تكون 6 أرقام أو 6 خانات من الأرقام والحروف الإنجليزية';
  end if;

  -- التحقق من كلمة مرور المدير الحالية.
  perform * from public.advance_manager_login(
    p_username => 'admin',
    p_password => p_manager_password
  );

  select c.column_name
    into password_column
  from information_schema.columns c
  where c.table_schema='public'
    and c.table_name='advance_givers'
    and lower(c.column_name) in (
      'password_hash','passwordhash','password_digest',
      'password_hash_value','password'
    )
    and c.data_type in ('text','character varying','character')
  order by case lower(c.column_name)
    when 'password_hash' then 1
    when 'passwordhash' then 2
    when 'password_digest' then 3
    when 'password_hash_value' then 4
    when 'password' then 5
    else 99 end
  limit 1;

  if password_column is null then
    raise exception 'لم يتم العثور على حقل كلمة المرور في جدول advance_givers';
  end if;

  execute format(
    'update public.advance_givers set %I = crypt($1, gen_salt(''bf'')) where id = $2 and coalesce(is_active,true)=true',
    password_column
  ) using p_new_password, p_giver_id;

  get diagnostics affected_rows = row_count;

  if affected_rows = 0 then
    raise exception 'المانح غير موجود أو غير فعال';
  end if;
end;
$$;

revoke all on function public.advance_manager_reset_giver_password(uuid,text,text) from public;
grant execute on function public.advance_manager_reset_giver_password(uuid,text,text) to anon, authenticated;
