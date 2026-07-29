-- Información de alumnos: datos fiscales/de identidad que los alumnos llenan
-- en un formulario público (/datos-alumno) para emitir sus certificados.
create table public.student_records (
  id uuid primary key default gen_random_uuid(),
  nombre_certificado text not null,   -- tal cual va impreso en el certificado
  curp text not null,                 -- 18 caracteres
  rfc text,                           -- opcional (12 o 13 caracteres)
  ocupacion text,
  curso text,                         -- grupo/curso, viene del link (?curso=)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La CURP identifica a la persona: si vuelve a mandar el formulario (por una
-- corrección), se actualiza su registro en lugar de duplicarlo. El índice va
-- sobre la columna tal cual (la ruta API siempre guarda en MAYÚSCULAS) porque
-- el upsert con on_conflict necesita un índice de columna, no de expresión.
create unique index student_records_curp_unico on public.student_records (curp);
create index student_records_recientes on public.student_records (created_at desc);

create trigger student_records_set_updated_at
  before update on public.student_records
  for each row execute function public.set_updated_at();

-- El formulario público escribe con service_role desde la ruta API; nadie más
-- que el admin autenticado puede leer estos datos personales.
alter table public.student_records enable row level security;
create policy "student_records_admin" on public.student_records
  for all to authenticated using (true) with check (true);
