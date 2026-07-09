-- Invitación por comentario (estilo ManyChat, pero nativo): cuando alguien comenta
-- en una publicación de Instagram, el bot le manda UN mensaje privado invitándolo
-- a la clase gratis de hemorragias. Apagado por defecto hasta activarlo en el panel.

alter table public.assistant_settings
  add column comment_dm_enabled boolean not null default false,
  -- {nombre} se reemplaza por el @usuario de quien comentó
  add column comment_dm_text text not null default 'Hey {nombre}! Vi tu comentario en mi publicación. Te cuento que el 1 de agosto voy a dar una clase gratis de control de hemorragias, 100% en vivo, con certificado Stop The Bleed si haces las prácticas. Regístrate aquí: https://hemorragias-vita.vercel.app/';

-- Registro de a quién ya se le mandó la invitación: máximo un DM por persona,
-- aunque comente veinte veces o en varios posts.
create table public.comment_invites (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'instagram',
  comment_id text not null,
  media_id text,
  ig_user_id text not null,
  username text,
  comment_text text,
  status text not null default 'pending', -- pending | sent | failed
  error text,
  created_at timestamptz not null default now()
);

create unique index comment_invites_user_unique on public.comment_invites (channel, ig_user_id);

alter table public.comment_invites enable row level security;

create policy "comment_invites_admin_all" on public.comment_invites for all to authenticated
  using (true) with check (true);
