-- Filtro de relevancia: antes de responder, Claude decide si el mensaje es
-- sobre los servicios de VITA RESCUE o es personal/social. Si es personal,
-- la IA no contesta (el mensaje se guarda igual para que Roy conteste él).

alter table public.assistant_settings
  add column relevance_filter_enabled boolean not null default true,
  add column relevance_filter_prompt text not null default 'Analiza este mensaje que le llegó a Roy Mata (@roymata01) por sus redes sociales personales y decide si está relacionado con sus servicios de primeros auxilios (VITA RESCUE: cursos, primeros auxilios, RCP, Método HÉROE, botiquines, productos de seguridad, precios, cotizaciones, información del negocio) o si es un mensaje personal/social (comentarios sobre contenido, saludos casuales, temas de amigos o familia, spam, u otro tema no relacionado).

Responde ÚNICAMENTE con una palabra:
- SI: si el mensaje trata sobre los cursos/productos/servicios de primeros auxilios, o hay interés real en ellos.
- NO: para cualquier otra cosa.';
