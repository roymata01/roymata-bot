-- Apagado de emergencia: si is_paused = true, los webhooks siguen guardando
-- los mensajes entrantes pero no se genera ni se envía respuesta de IA.

alter table public.assistant_settings
  add column is_paused boolean not null default false;

update public.assistant_settings set is_paused = true where id = 1;
