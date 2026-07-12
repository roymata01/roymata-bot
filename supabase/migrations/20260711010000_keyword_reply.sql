-- Disparador por palabra clave (para historias tipo "responde CURSO"):
-- si el mensaje entrante es exactamente la palabra clave, el bot manda al
-- instante la respuesta con el link de registro — sin pasar por el clasificador.

alter table public.assistant_settings
  add column keyword_trigger text not null default 'curso',
  add column keyword_reply text not null default 'Va! Aquí está el link para que te registres a la clase GRATIS de Control de Hemorragias del 1 de agosto: https://hemorragias-vita.vercel.app/?ig=1 — es 100% en vivo y con certificado si haces las prácticas. Nos vemos ahí!';
