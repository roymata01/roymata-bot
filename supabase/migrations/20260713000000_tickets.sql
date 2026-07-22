-- Facturación automática de tickets: Roy sube foto del ticket desde el panel,
-- la IA extrae los datos (OCR), y la corrida diaria de las 10am factura en el
-- portal de cada tienda. El bucket privado "tickets" ya se creó por API.

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  fecha_compra date,
  tienda text,
  monto numeric(12,2),
  folio text,
  datos_extra jsonb not null default '{}'::jsonb, -- código de facturación, estación, etc.
  foto_path text not null, -- ruta en el bucket "tickets"
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE','FACTURADO','REVISION_MANUAL','INCOMPLETO','VENCIDO')),
  fecha_limite date, -- regla general: último día del mes de la compra
  factura_pdf_url text,
  factura_xml_url text,
  fecha_facturado timestamptz,
  drive_sync boolean not null default false, -- ya espejado a Google Drive
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

alter table public.tickets enable row level security;

create policy "tickets_admin_all" on public.tickets for all to authenticated
  using (true) with check (true);

-- acceso del panel (sesión iniciada) al bucket de fotos
create policy "tickets_storage_auth" on storage.objects for all to authenticated
  using (bucket_id = 'tickets') with check (bucket_id = 'tickets');
