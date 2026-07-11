-- Cotizaciones pendientes: cuando alguien pide un curso para un grupo
-- (empresa, escuela, brigada...), la IA extrae sus datos de la conversación
-- (nombre, correo, teléfono, número de personas) y los junta aquí para que
-- Roy identifique de un vistazo quién pidió cotización.

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  nombre text,
  organizacion text, -- empresa/escuela/institución
  num_personas int,
  correo text,
  telefono text,
  notas text, -- resumen corto de lo que piden
  status text not null default 'pendiente', -- pendiente | atendida
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- una cotización por conversación; los datos se van completando conforme llegan
create unique index quote_requests_conversation_unique on public.quote_requests (conversation_id);

create trigger quote_requests_set_updated_at
  before update on public.quote_requests
  for each row execute function public.set_updated_at();

alter table public.quote_requests enable row level security;

create policy "quote_requests_admin_all" on public.quote_requests for all to authenticated
  using (true) with check (true);
