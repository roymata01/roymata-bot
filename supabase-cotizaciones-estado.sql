-- Estados de seguimiento de cotizaciones emitidas: enviada → atendida → resuelta.
-- Pegar y correr en el SQL Editor de Supabase (proyecto lgztrnrfzfczrvsscbcb).
alter table public.cotizaciones_emitidas
  drop constraint if exists cotizaciones_emitidas_estado_check;

alter table public.cotizaciones_emitidas
  add constraint cotizaciones_emitidas_estado_check
  check (estado in ('borrador','enviada','atendida','resuelta'));
