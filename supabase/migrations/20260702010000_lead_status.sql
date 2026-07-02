alter table contacts
  add column lead_status text check (lead_status in ('interesado', 'registrado', 'sin_interes', 'cliente'));

create index if not exists contacts_lead_status_idx on contacts (lead_status);
