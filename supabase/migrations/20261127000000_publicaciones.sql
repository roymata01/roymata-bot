-- Publicador por WhatsApp (27-nov-2026): cada video que pasa por el bot para
-- publicarse en las redes de Roy. Una fila = un video; `resultados` guarda el
-- link (o el error) de cada red, así que esta tabla ES la bitácora de posts.
create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- mac = lo mandó una sesión de Claude desde la Mac; whatsapp = Roy lo mandó al bot
  origen text not null check (origen in ('mac', 'whatsapp')),
  -- recibido → preparando → lista (copys enviados) → publicando → publicado | parcial | error
  -- esperando_ventana = el aviso salió por plantilla y falta que Roy conteste
  -- cancelado = Roy dijo que no
  estado text not null default 'recibido',

  nombre_archivo text,
  mime text,
  bytes bigint,
  partes int,               -- el video se guarda en partes de 45 MB (bucket publicaciones/<id>/parte-000…)
  duracion numeric,         -- segundos
  ancho int,
  alto int,
  wa_media_id text,         -- id del archivo ya subido a WhatsApp (para mandárselo a Roy)
  wa_tipo text,             -- document (≤16 MB, el archivo tal cual) | video (vista previa; el HD está en el bucket)
  nota_roy text,            -- pie de foto que Roy escribió al mandar el video
  transcripcion text,

  copy jsonb,               -- {instagram, facebook, youtube:{titulo,descripcion,etiquetas}, tiktok}
  redes text[],             -- redes que pidió al decir "publicar"
  resultados jsonb not null default '{}'::jsonb, -- {instagram:{ok,link|error,at}, …}
  error text,

  aprobado_at timestamptz,  -- cuándo dijo "publicar"
  publicado_at timestamptz,
  archivo_borrado_at timestamptz
);

create index if not exists publicaciones_created_idx on public.publicaciones (created_at desc);
create index if not exists publicaciones_estado_idx on public.publicaciones (estado);

-- Solo el servidor (service_role) la usa.
alter table public.publicaciones enable row level security;
