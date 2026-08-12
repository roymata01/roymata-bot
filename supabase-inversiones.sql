-- Inversiones personales de Roy (dashboard en /inversiones, mundo Personal).
-- Pegar y correr en el SQL Editor de Supabase (proyecto lgztrnrfzfczrvsscbcb).

create table if not exists public.inversiones (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,          -- ticker: SMH, NVDA...
  cantidad numeric not null default 0,
  costo_promedio numeric not null default 0,  -- por acción, MXN
  precio_actual numeric not null default 0,   -- por acción, MXN (Roy lo actualiza a mano)
  objetivo text,                       -- AUMENTAR, 25%, etc.
  notas text,
  updated_at timestamptz not null default now()
);

create table if not exists public.inversiones_snapshots (
  fecha date primary key,
  invertido numeric not null,
  valor numeric not null
);

create table if not exists public.inversiones_config (
  id int primary key default 1,
  sheet_url text,
  fecha_inicio date
);
insert into public.inversiones_config (id, fecha_inicio)
  values (1, '2026-05-01') on conflict (id) do nothing;

alter table public.inversiones enable row level security;
alter table public.inversiones_snapshots enable row level security;
alter table public.inversiones_config enable row level security;

-- El panel opera con la sesión de Roy (mismo patrón que el resto del sistema)
create policy "inversiones full para autenticados" on public.inversiones
  for all to authenticated using (true) with check (true);
create policy "snapshots full para autenticados" on public.inversiones_snapshots
  for all to authenticated using (true) with check (true);
create policy "config inversiones full para autenticados" on public.inversiones_config
  for all to authenticated using (true) with check (true);
