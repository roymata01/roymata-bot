-- Hilo de correos por cotización: lo que enviamos y las RESPUESTAS del cliente
-- (recibidas vía Resend Inbound en respuestas.vitarescue.com.mx).
-- Pegar y correr en el SQL Editor de Supabase (proyecto lgztrnrfzfczrvsscbcb).
create table if not exists public.cotizacion_correos (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid references public.cotizaciones_emitidas(id) on delete set null,
  folio int,                           -- S<folio> de la cotización (null si no se pudo ligar)
  direction text not null check (direction in ('in','out')),
  from_email text not null,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  resend_id text,                      -- id del correo en Resend (dedupe de webhooks reintentados)
  created_at timestamptz not null default now()
);

create unique index if not exists cotizacion_correos_resend_id_unique
  on public.cotizacion_correos (resend_id) where resend_id is not null;

create index if not exists cotizacion_correos_cotizacion_idx
  on public.cotizacion_correos (cotizacion_id, created_at);

alter table public.cotizacion_correos enable row level security;

-- El panel del bot la lee con la sesión del admin (mismo patrón que el resto)
create policy "cotizacion_correos para usuarios autenticados"
  on public.cotizacion_correos for select
  to authenticated using (true);
