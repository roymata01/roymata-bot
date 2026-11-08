-- FLUJO DEA (masterclass de diciembre) — 8-nov-2026
-- comment_invites tenía un candado de "un DM por persona PARA SIEMPRE"
-- (único por canal + usuario). Con la segunda campaña eso ya no sirve:
-- quien comentó QUIERO en octubre también puede comentar DEA ahora.
-- El candado se vuelve "un DM por persona POR CAMPAÑA".

-- 1) La campaña de cada invitación (todo lo viejo fue del flujo QUIERO)
alter table comment_invites
  add column if not exists flujo text not null default 'quiero';

-- 2) Tirar el candado viejo (constraint o índice único sin la campaña)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'comment_invites'::regclass and contype = 'u'
  loop
    execute format('alter table comment_invites drop constraint %I', r.conname);
  end loop;
  for r in
    select indexname from pg_indexes
    where tablename = 'comment_invites'
      and indexdef ilike '%unique%'
      and indexdef ilike '%ig_user_id%'
      and indexdef not ilike '%flujo%'
  loop
    execute format('drop index if exists %I', r.indexname);
  end loop;
end $$;

-- 3) El candado nuevo: un DM por persona por campaña
create unique index if not exists comment_invites_canal_usuario_flujo
  on comment_invites (channel, ig_user_id, flujo);
