-- Campañas de WhatsApp (mensajes masivos con plantillas aprobadas por Meta).
-- Solo a personas con opt-in (registrados que dieron su teléfono). Envío
-- espaciado por tandas para cuidar la calidad del número y no ser bloqueados.

create table public.wa_campaigns (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  template_name text not null,
  template_lang text not null default 'es_MX',
  status text not null default 'borrador'
    check (status in ('borrador','enviando','pausada','completada')),
  total int not null default 0,
  enviados int not null default 0,
  fallidos int not null default 0,
  por_dia int not null default 200, -- tope de envíos por corrida/día (calienta el número)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger wa_campaigns_set_updated_at
  before update on public.wa_campaigns
  for each row execute function public.set_updated_at();

create table public.wa_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.wa_campaigns(id) on delete cascade,
  phone text not null,          -- E.164 normalizado (52XXXXXXXXXX)
  nombre text,                  -- variable {{1}} de la plantilla
  status text not null default 'pendiente'
    check (status in ('pendiente','enviado','fallido','baja')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index wa_campaign_recipients_pendientes on public.wa_campaign_recipients (campaign_id, status);
create unique index wa_campaign_recipients_unico on public.wa_campaign_recipients (campaign_id, phone);

-- lista negra de opt-out: quien respondió BAJA nunca vuelve a recibir campañas
create table public.wa_optouts (
  phone text primary key,       -- E.164 normalizado
  created_at timestamptz not null default now()
);

alter table public.wa_campaigns enable row level security;
alter table public.wa_campaign_recipients enable row level security;
alter table public.wa_optouts enable row level security;
create policy "wa_campaigns_admin" on public.wa_campaigns for all to authenticated using (true) with check (true);
create policy "wa_recipients_admin" on public.wa_campaign_recipients for all to authenticated using (true) with check (true);
create policy "wa_optouts_admin" on public.wa_optouts for all to authenticated using (true) with check (true);
