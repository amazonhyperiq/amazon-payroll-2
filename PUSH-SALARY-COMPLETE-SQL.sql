-- Amazon Advances: prevent duplicate monthly payroll-complete notifications
create table if not exists public.salary_month_notifications (
  salary_month date primary key,
  created_at timestamptz not null default now()
);

alter table public.salary_month_notifications enable row level security;

drop policy if exists "salary month notifications insert" on public.salary_month_notifications;
create policy "salary month notifications insert"
on public.salary_month_notifications
for insert to anon, authenticated
with check (true);

create or replace function public.claim_salary_month_notification(p_month date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.salary_month_notifications(salary_month)
  values (p_month)
  on conflict (salary_month) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

notify pgrst, 'reload schema';
