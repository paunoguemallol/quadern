-- 1) Taula de perfils: guarda el nom d'usuari "bonic" lligat al compte real de Supabase Auth
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create policy "usuaris poden veure el seu propi perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "usuaris poden crear el seu propi perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 2) Taula única per a totes les dades de l'app (tasques, categories, neteja, compres, economia...)
--    Cada fila = una "clau" de dades (com "tasks", "categories", etc.) per a un usuari concret.
create table public.user_data (
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);
alter table public.user_data enable row level security;

create policy "usuaris nomes gestionen les seves dades"
  on public.user_data for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
