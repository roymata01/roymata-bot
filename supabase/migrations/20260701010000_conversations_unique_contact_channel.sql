-- Un contacto tiene como máximo una conversación por canal (se reabre/reactiva,
-- no se duplica). Esto permite resolverla con upsert atómico desde los webhooks.

alter table public.conversations
  add constraint conversations_contact_channel_key unique (contact_id, channel);
