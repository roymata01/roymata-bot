-- VITA RESCUE INBOX — esquema inicial (mono-tenant)
-- Canales soportados: whatsapp, instagram, messenger

create extension if not exists pgcrypto;

-- ============ FUNCIONES AUXILIARES ============

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ PERFILES DE USUARIOS DEL PANEL ============

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- crea el perfil automáticamente cuando alguien se registra en Supabase Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ CUENTAS DE CANAL CONECTADAS ============

create table public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  label text not null,
  external_account_id text not null, -- phone_number_id / ig_business_id / fb_page_id
  waba_id text,
  is_active boolean not null default true,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_account_id)
);

create trigger channel_accounts_set_updated_at
  before update on public.channel_accounts
  for each row execute function public.set_updated_at();

-- ============ CONTACTOS ============

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  external_id text not null, -- número de WhatsApp o PSID/IGSID
  display_name text,
  phone text,
  avatar_url text,
  tags text[] not null default '{}',
  notes text,
  first_contact_at timestamptz not null default now(),
  last_contact_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_id)
);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ============ CONVERSACIONES ============

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  status text not null default 'con_ia' check (status in ('con_ia', 'por_atender', 'atendiendo', 'apagada', 'cerrada')),
  ai_enabled boolean not null default true,
  assigned_user_id uuid references auth.users(id),
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz, -- para calcular la ventana de 24h de WhatsApp
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_status_idx on public.conversations(status);
create index conversations_channel_idx on public.conversations(channel);
create index conversations_last_message_at_idx on public.conversations(last_message_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ============ MENSAJES ============

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  direction text not null check (direction in ('in', 'out')),
  sender_type text not null check (sender_type in ('contact', 'ai', 'human')),
  sender_user_id uuid references auth.users(id),
  content text,
  media_url text,
  media_type text,
  meta_message_id text, -- id del mensaje que da Meta (wamid / mid), para idempotencia
  status text check (status in ('sent', 'delivered', 'read', 'failed')),
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create unique index messages_channel_meta_message_id_key
  on public.messages(channel, meta_message_id) where meta_message_id is not null;
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);

-- mantiene conversations.last_message_at / preview / unread_count sin lógica repetida en cada webhook
create or replace function public.touch_conversation_on_message()
returns trigger language plpgsql as $$
begin
  update public.conversations
  set
    last_message_at = new.created_at,
    last_message_preview = left(coalesce(new.content, ''), 140),
    last_inbound_at = case when new.direction = 'in' then new.created_at else last_inbound_at end,
    unread_count = case when new.direction = 'in' then unread_count + 1 else 0 end
  where id = new.conversation_id;

  update public.contacts
  set last_contact_at = new.created_at
  where id = new.contact_id and new.direction = 'in';

  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- ============ IDEMPOTENCIA DE WEBHOOKS ============
-- Meta reintenta el envío de eventos; esta tabla evita procesar el mismo evento dos veces.

create table public.processed_webhook_events (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  event_id text not null,
  payload jsonb,
  processed_at timestamptz not null default now(),
  unique (channel, event_id)
);

-- ============ BASE DE CONOCIMIENTO (Personalización) ============

create table public.knowledge_base_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique, -- 'servicios', 'tono', 'reglas', 'faq', etc.
  title text not null,
  content text not null default '',
  order_index int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger knowledge_base_sections_set_updated_at
  before update on public.knowledge_base_sections
  for each row execute function public.set_updated_at();

-- ============ CONFIGURACIÓN DEL ASISTENTE (singleton) ============

create table public.assistant_settings (
  id int primary key default 1 check (id = 1),
  model text not null default 'claude-haiku-4-5-20251001',
  max_tokens int not null default 500,
  escalation_keywords text[] not null default '{}',
  business_hours jsonb not null default '{}',
  off_hours_message text,
  updated_at timestamptz not null default now()
);

insert into public.assistant_settings (id) values (1);

create trigger assistant_settings_set_updated_at
  before update on public.assistant_settings
  for each row execute function public.set_updated_at();

-- ============ TEMPLATES ============

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text check (channel in ('whatsapp', 'instagram', 'messenger')),
  category text,
  body text not null,
  variables text[] not null default '{}',
  meta_template_name text,
  meta_template_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

-- ============ CAMPAÑAS ============

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid references public.templates(id),
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  segment_filter jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error text,
  unique (campaign_id, contact_id)
);

-- ============ WORKFLOWS ============

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  priority int not null default 0,
  trigger_type text not null check (trigger_type in ('contains_keyword', 'emergency_keyword')),
  trigger_config jsonb not null default '{}', -- { "keywords": ["..."], "channel": null }
  action_type text not null check (action_type in ('tag', 'reply_template', 'notify', 'disable_ai')),
  action_config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workflows_set_updated_at
  before update on public.workflows
  for each row execute function public.set_updated_at();

create table public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  executed_at timestamptz not null default now()
);

-- ============ CONSUMO DE TOKENS DE CLAUDE (Costos) ============

create table public.token_usage_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index token_usage_logs_created_at_idx on public.token_usage_logs(created_at);

-- ============ ROW LEVEL SECURITY ============
-- El backend (webhooks, envío de IA) usa la service_role key y siempre ignora RLS.
-- Estas políticas solo aplican a las consultas del panel hechas con sesión de usuario autenticado.

alter table public.profiles enable row level security;
alter table public.channel_accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.knowledge_base_sections enable row level security;
alter table public.assistant_settings enable row level security;
alter table public.templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_executions enable row level security;
alter table public.token_usage_logs enable row level security;
alter table public.processed_webhook_events enable row level security;
-- (processed_webhook_events y channel_accounts.access token no se exponen al panel salvo admin)

create policy "profiles_select_all" on public.profiles for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid());

create policy "channel_accounts_admin_all" on public.channel_accounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "contacts_authenticated_all" on public.contacts for all to authenticated
  using (true) with check (true);

create policy "conversations_authenticated_all" on public.conversations for all to authenticated
  using (true) with check (true);

create policy "messages_authenticated_all" on public.messages for all to authenticated
  using (true) with check (true);

create policy "knowledge_base_admin_all" on public.knowledge_base_sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "assistant_settings_admin_all" on public.assistant_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "templates_authenticated_all" on public.templates for all to authenticated
  using (true) with check (true);

create policy "campaigns_authenticated_all" on public.campaigns for all to authenticated
  using (true) with check (true);

create policy "campaign_recipients_authenticated_all" on public.campaign_recipients for all to authenticated
  using (true) with check (true);

create policy "workflows_admin_all" on public.workflows for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "workflow_executions_authenticated_select" on public.workflow_executions for select to authenticated
  using (true);

create policy "token_usage_logs_authenticated_select" on public.token_usage_logs for select to authenticated
  using (true);

-- ============ REALTIME ============
-- Habilita la bandeja en vivo (Fase 4)

alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
