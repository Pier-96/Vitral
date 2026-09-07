-- Planes de entrenamiento creados por el coach y seguidos por el asesorado.
create table if not exists public.training_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Rutina semanal',
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_active_routine_per_user on public.training_routines(user_id) where active;

create table if not exists public.routine_days (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.training_routines(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  title text not null default '',
  is_rest boolean not null default false,
  estimated_minutes smallint,
  unique(routine_id, weekday)
);

create table if not exists public.planned_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_day_id uuid not null references public.routine_days(id) on delete cascade,
  name text not null,
  sets smallint not null default 3,
  repetitions text not null default '8–12',
  rest_seconds smallint,
  target_weight text,
  coach_note text not null default '',
  video_url text,
  position smallint not null default 0
);

create table if not exists public.planned_exercise_completions (
  id uuid primary key default gen_random_uuid(),
  planned_exercise_id uuid not null references public.planned_exercises(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  completed_at timestamptz,
  feedback text not null default '',
  unique(planned_exercise_id, user_id, week_start)
);

alter table public.training_routines enable row level security;
alter table public.routine_days enable row level security;
alter table public.planned_exercises enable row level security;
alter table public.planned_exercise_completions enable row level security;

create policy "own routines" on public.training_routines for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own routine days" on public.routine_days for all using (exists(select 1 from public.training_routines r where r.id=routine_id and r.user_id=auth.uid())) with check (exists(select 1 from public.training_routines r where r.id=routine_id and r.user_id=auth.uid()));
create policy "own planned exercises" on public.planned_exercises for all using (exists(select 1 from public.routine_days d join public.training_routines r on r.id=d.routine_id where d.id=routine_day_id and r.user_id=auth.uid())) with check (exists(select 1 from public.routine_days d join public.training_routines r on r.id=d.routine_id where d.id=routine_day_id and r.user_id=auth.uid()));
create policy "own planned completions" on public.planned_exercise_completions for all using (user_id=auth.uid()) with check (user_id=auth.uid());
