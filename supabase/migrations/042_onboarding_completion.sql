alter table public.profiles add column if not exists onboarding_completed_at timestamptz;

-- Existing plans are evidence that the athlete already reached the coach.
update public.profiles p set onboarding_completed_at = now()
where onboarding_completed_at is null and exists (
  select 1 from public.coach_reports r where r.user_id = p.id and r.period_type = 'week'
    and r.full_report is not null
);
