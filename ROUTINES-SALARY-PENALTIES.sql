-- إضافة جداول الرواتب والعقوبات لنظام سلف موظفي وعمال أمازون
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor. آمن لإعادة التشغيل: يستخدم CREATE IF NOT EXISTS وALTER IF NOT EXISTS.

create table if not exists public.employee_salaries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  salary_month date not null,
  currency text not null default 'IQD' check (currency in ('IQD','USD')),
  nominal_salary numeric(14,2) not null default 0,
  official_hours numeric(6,2) not null default 8,
  work_hours numeric(8,2) not null default 0,
  overtime_hours numeric(8,2) not null default 0,
  overtime_daily_hours numeric(6,2) not null default 0,
  second_job_enabled boolean not null default false,
  second_job_daily_value numeric(14,2) not null default 0,
  second_job_days numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_salaries_month_unique unique(employee_id, salary_month),
  constraint employee_salaries_month_first_day check (extract(day from salary_month)=1),
  constraint employee_salaries_hours_positive check (official_hours > 0),
  constraint employee_salaries_values_nonnegative check (
    nominal_salary >= 0 and official_hours > 0 and work_hours >= 0 and overtime_hours >= 0
    and overtime_daily_hours >= 0 and second_job_daily_value >= 0 and second_job_days >= 0
  )
);

create table if not exists public.employee_penalties (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  penalty_date date not null default current_date,
  penalty_type text not null check (penalty_type in ('deduction','absence1','absence2')),
  amount numeric(14,2) not null default 0,
  currency text not null default 'IQD' check (currency in ('IQD','USD')),
  notes text,
  created_at timestamptz not null default now(),
  constraint employee_penalties_amount_nonnegative check (amount >= 0),
  constraint employee_penalties_deduction_amount check (penalty_type <> 'deduction' or amount > 0)
);

-- تحديث آمن للنسخ التي كانت تستخدم overtime_hours فقط.
alter table public.employee_salaries add column if not exists overtime_daily_hours numeric(6,2) not null default 0;

-- تحديث آمن لجدول العقوبات في النسخ القديمة.
alter table public.employee_penalties add column if not exists currency text not null default 'IQD';
update public.employee_penalties set currency='IQD' where currency is null or currency not in ('IQD','USD');
do $$ begin
  if not exists (select 1 from pg_constraint where conname='employee_penalties_currency_check') then
    alter table public.employee_penalties add constraint employee_penalties_currency_check check (currency in ('IQD','USD'));
  end if;
end $$;

create index if not exists employee_salaries_month_idx on public.employee_salaries(salary_month);
create index if not exists employee_salaries_employee_idx on public.employee_salaries(employee_id);
create index if not exists employee_penalties_date_idx on public.employee_penalties(penalty_date);
create index if not exists employee_penalties_employee_idx on public.employee_penalties(employee_id);

-- نفس نمط الوصول المستخدم في الموقع الحالي (الموقع يستخدم مفتاح publishable/anon).
grant select, insert, update, delete on public.employee_salaries to anon, authenticated;
grant select, insert, update, delete on public.employee_penalties to anon, authenticated;

-- لا نفعّل RLS هنا حتى لا نمنع الموقع الحالي من قراءة/حفظ البيانات عبر المفتاح publishable.
-- صلاحية أزرار الإدارة في الواجهة مقيدة للمدير، كما هو معمول به في النظام الحالي.


-- تحديث PostgREST بعد أي تغييرات في بنية الجداول.
NOTIFY pgrst, 'reload schema';
