-- Permite solicitudes de cotización desde la página pública (sin conversación
-- de chat). Pegar y correr en el SQL Editor de Supabase (proyecto lgztrnrfzfczrvsscbcb).
alter table public.quote_requests alter column conversation_id drop not null;
alter table public.quote_requests alter column contact_id drop not null;
