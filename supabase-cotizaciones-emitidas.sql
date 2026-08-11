-- Cotizaciones generadas desde el panel (/cotizaciones → Generar cotización).
-- Pegar y correr en el SQL Editor de Supabase (proyecto lgztrnrfzfczrvsscbcb).
create table if not exists public.cotizaciones_emitidas (
  id uuid primary key default gen_random_uuid(),
  folio int not null unique,               -- se muestra como S<folio>; arranca en 11027
  quote_request_id uuid references public.quote_requests(id) on delete set null,
  dirigida text not null,
  num_personas int not null,
  precio_unitario numeric not null,
  viaticos numeric not null default 0,
  descuento_pct int not null default 0,
  total numeric not null,
  pdf_url text not null,
  estado text not null default 'borrador' check (estado in ('borrador','enviada')),
  enviada_por text[] not null default '{}',  -- p.ej. {correo, chat}
  created_at timestamptz not null default now()
);

alter table public.cotizaciones_emitidas enable row level security;

-- El panel la lee con la sesión del admin (como el resto de tablas del sistema)
create policy "cotizaciones emitidas para usuarios autenticados"
  on public.cotizaciones_emitidas for select
  to authenticated using (true);
