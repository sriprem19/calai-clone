-- Food logs table
create table public.food_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  logged_at date not null default current_date,
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snack')) default 'snack',
  food_name text not null,
  calories integer not null default 0,
  protein_g numeric(6,2) default 0,
  carbs_g numeric(6,2) default 0,
  fat_g numeric(6,2) default 0,
  image_url text,
  ai_confidence text check (ai_confidence in ('high','medium','low')) default 'medium',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Daily goals table
create table public.daily_goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  calorie_goal integer default 2000,
  protein_goal integer default 150,
  carbs_goal integer default 200,
  fat_goal integer default 65,
  created_at timestamptz default now()
);

-- Streaks table
create table public.streaks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  current_streak integer default 0,
  longest_streak integer default 0,
  last_logged_date date,
  updated_at timestamptz default now()
);

-- RLS policies
alter table public.food_logs enable row level security;
alter table public.daily_goals enable row level security;
alter table public.streaks enable row level security;

create policy "Users can manage own food logs"
  on public.food_logs for all using (auth.uid() = user_id);

create policy "Users can manage own goals"
  on public.daily_goals for all using (auth.uid() = user_id);

create policy "Users can manage own streaks"
  on public.streaks for all using (auth.uid() = user_id);

-- Auto-create goals and streak on profile creation
create or replace function public.handle_new_user_calai()
returns trigger language plpgsql security definer as $$
begin
  insert into public.daily_goals (user_id) values (new.id);
  insert into public.streaks (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_profile_created_calai
  after insert on public.profiles
  for each row execute procedure public.handle_new_user_calai();