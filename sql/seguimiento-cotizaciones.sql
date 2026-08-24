-- Motor de seguimiento de cotizaciones.
-- Registra qué recordatorio se le mandó a cada cotización, para no repetir
-- ninguno aunque el cron corra muchas veces.

create table if not exists cotizacion_seguimientos (
  id          uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones_emitidas(id) on delete cascade,
  folio       integer not null,
  paso        smallint not null,          -- 1 = 3 días, 2 = 7 días, 3 = 14 días
  to_email    text,
  resend_id   text,
  enviado_at  timestamptz not null default now(),
  -- La red de seguridad: un mismo paso no se puede mandar dos veces.
  unique (cotizacion_id, paso)
);

create index if not exists idx_seg_cotizacion on cotizacion_seguimientos(cotizacion_id);

-- Interruptor por cotización: si Roy la apaga, el motor la deja en paz.
alter table cotizaciones_emitidas
  add column if not exists seguimiento_pausado boolean not null default false;

-- Solo el servidor entra a esta tabla (el motor usa la service key).
alter table cotizacion_seguimientos enable row level security;
