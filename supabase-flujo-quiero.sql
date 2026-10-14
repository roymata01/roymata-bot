-- Flujo de venta QUIERO (14-oct-2026): guarda los textos que Roy
-- edita en /flujo. Una fila por flujo; data = overrides por nodo.
create table if not exists public.bot_flujos (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bot_flujos enable row level security;

create policy "bot_flujos full para autenticados" on public.bot_flujos
  for all to authenticated using (true) with check (true);
