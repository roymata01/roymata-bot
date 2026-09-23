-- Estrategia de comentarios 2026-09-23 (pedido de Roy):
-- El bot abre plática con quien comenta sus videos, presenta el Instituto
-- VITA en la conversación y, si quieren inscribirse (cerrado hasta
-- diciembre), los captura en la lista de espera de la Generación 2.

create table public.lista_espera_gen2 (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text,
  nombre text,
  usuario text,       -- @ o nombre visible en la red
  correo text,
  telefono text,
  notas text,         -- resumen corto del interés
  origen text not null default 'dm', -- dm | comentario | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id)
);

alter table public.lista_espera_gen2 enable row level security;

-- Personas a las que el bot NUNCA debe mandar DM por comentario
-- (gente que Roy sigue/conoce: colegas, amigos, marcas).
create table public.comment_dm_excluidos (
  id bigint generated always as identity primary key,
  channel text not null,   -- instagram | messenger | ambos
  username text not null,  -- en minúsculas, sin @
  nota text,
  created_at timestamptz not null default now(),
  unique (channel, username)
);

alter table public.comment_dm_excluidos enable row level security;
