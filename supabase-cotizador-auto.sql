-- Cerebros del cotizador automático (Nivel 1):
--   cotizador_tarifas  → viáticos por estado (editable desde el admin de cursos)
--   cotizador_cursos   → precio por persona por curso (editable igual)
-- Pegar y correr en el SQL Editor de Supabase (proyecto lgztrnrfzfczrvsscbcb).
create table if not exists public.cotizador_tarifas (
  estado text primary key,          -- nombre del estado MX; fila especial 'Puebla (capital)'
  viaticos numeric not null default 0,
  nota text
);

create table if not exists public.cotizador_cursos (
  nombre text primary key,          -- debe coincidir con el select del formulario /cotizar
  precio_unitario numeric not null default 850,
  activo boolean not null default true
);

alter table public.cotizador_tarifas enable row level security;
alter table public.cotizador_cursos enable row level security;
