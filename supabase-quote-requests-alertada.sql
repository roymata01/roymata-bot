-- Marca de "ya se le avisó a Roy por WhatsApp" en solicitudes de cotización.
-- Se crea con default TRUE para que las solicitudes VIEJAS no disparen avisos,
-- y luego el default queda en FALSE para que toda solicitud nueva sí avise.
-- Pegar y correr en el SQL Editor de Supabase (proyecto lgztrnrfzfczrvsscbcb).
alter table public.quote_requests add column if not exists alertada boolean not null default true;
alter table public.quote_requests alter column alertada set default false;
