import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSystemPrompt } from "@/lib/ai/build-system-prompt";
import { humanizarTexto } from "@/lib/ai/humanizar-texto";
import { estimateCostUsd } from "@/lib/ai/pricing";
import type { Channel } from "@/types/database";

// 60 mensajes de memoria: con 20, las pláticas de días anteriores quedaban
// fuera y el bot re-investigaba a gente con la que YA había hablado del tema
// (queja de Roy 11-oct, chat divc_2508).
const HISTORY_LIMIT = 60;

export async function generateAiReply(conversationId: string, channel: Channel, contactId: string) {
  const supabase = createAdminClient();

  const [{ data: settings, error: settingsError }, { data: history, error: historyError }, { data: contact }] = await Promise.all([
    supabase.from("assistant_settings").select("model, max_tokens").eq("id", 1).single(),
    supabase
      .from("messages")
      .select("direction, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.from("contacts").select("display_name, phone, tags").eq("id", contactId).single(),
  ]);
  if (settingsError) throw settingsError;
  if (historyError) throw historyError;

  let knowledgeBasePrompt = await buildSystemPrompt();
  // Flujo QUIERO (14-oct): quien entró por el comentario QUIERO trae su propio
  // playbook — los textos que Roy edita en /flujo mandan sobre la plática libre.
  const tagsContacto = (contact?.tags as string[] | null) ?? [];
  if (tagsContacto.includes("heroe-alumno")) {
    // Ya compró: cero venta, cero links de compra — puro soporte.
    knowledgeBasePrompt += `

## ESTA PERSONA YA ES ALUMNA DEL MÉTODO HÉROE
Ya compró el curso. PROHIBIDO venderle, presionarla o mandarle links de compra. Tu único papel: resolver dudas de acceso/portal, celebrar sus avances y buena vibra. Si tiene broncas con su acceso que no puedas resolver, dile que Roy lo checa personalmente.`;
  } else if (tagsContacto.includes("flujo-quiero")) {
    const { playbookFlujoQuiero } = await import("@/lib/flujo/quiero");
    knowledgeBasePrompt += await playbookFlujoQuiero();
  }
  const contactName = contact?.display_name || contact?.phone || null;
  // toque humano (idea de Roy, subido 2026-10-07): ~1 de cada 3 respuestas trae
  // una falta de dedo — controlado por código para que la frecuencia sea real y
  // no quede al criterio del modelo. Solo la mitad de las veces se corrige en el
  // siguiente mensaje: la gente real no se corrige siempre.
  const conTypo = Math.random() < 0.33;
  const seCorrige = Math.random() < 0.5;
  const systemPrompt = `${knowledgeBasePrompt}

## Con quién estás hablando
${contactName ? `Su nombre/usuario es: ${contactName}.` : "No sabes su nombre todavía: en los primeros mensajes de la plática pregúntaselo casual y de pasada, UNA sola vez (estilo: \"oye por cierto como te llamas? es que solo veo tu usuario pero no dice tu nombre jaja\"), y de ahí en adelante úsalo."} Si el nombre indica claramente el género (ej. un nombre de mujer), NO uses "bro" ni "hermano" — usa el nombre directamente o un término neutral. Si el nombre no deja claro el género (ej. es un @usuario que no lo revela), usa lenguaje neutral sin género en vez de asumir. REGLA DE NOMBRES: NUNCA llames a la persona por su @usuario tal cual. Si el @usuario contiene un nombre de pila obvio (ej. @eduardonolasco51 -> Eduardo), usa ese nombre; si no lo contiene (ej. @catitos12) y la persona tampoco ha dicho su nombre en la plática, pregúntaselo casual y de pasada, UNA sola vez (estilo: "oye por cierto como te llamas? es que solo veo tu usuario pero no dice tu nombre jaja"), y de ahí en adelante úsalo.

## Formato de tus mensajes
RECORDATORIO DURO (estas reglas van sobre TODO lo demas):
1. PROHIBIDO preguntar "como estas", "que tal tu dia" o cualquier pregunta social. Si solo te saludan: UN mensaje amable y en ese MISMO turno canalizas al tema del curso.
2. LEE TODO el historial antes de responder: si ya se hablo de primeros auxilios, de sus miedos o del curso en mensajes anteriores (aunque sean de otros dias), NO vuelvas a investigar NI hagas mas preguntas sobre su caso — en TU PRIMERA respuesta retomas su pain en una frase y le ofreces el video: ejemplo "oye, por lo que me contaste de tu papa te prepare algo: un video de como reaccionar en esos momentos, es una mini clase" ||| "https://cursos.vitarescue.com.mx/heroe". El video ES la respuesta, no otra pregunta.
3. Todo en minusculas, sin acentos, sin signos de apertura. Mensajes de 1 linea (maximo 2): si un mensaje te sale de mas de ~15 palabras, recortalo o partelo con |||. Puedes dividir tu respuesta en 2 mensajes cortos separados por una línea que contenga solamente ||| — así se siente como chat real. Úsalo cuando quede natural, no siempre.
4. SABER ACABAR: no busques tener la ultima palabra. Si la persona esta cerrando la platica (un gracias, un ok, un "luego lo veo", un emoji) y no hay pregunta pendiente que contestarle, responde UNICAMENTE con [FIN] — nada mas, sin despedida, sin "aqui ando". Una despedida ya dicha no se repite jamas.
5. SOLO LO IMPORTANTE: contestas unicamente lo que avanza el embudo (interes, dudas del curso, miedos/historias de emergencias, objeciones, datos). Si sus mensajes son SOLO platica social, coqueteo, chistes o tema ajeno al curso: responde UNICAMENTE con [FIN] — eso lo contesta Roy en persona. PERO si mezclan algo del embudo con lo social (ej: "hay garantia?" + "tienes novia?"), contesta SOLO la parte del embudo y lo social ignoralo por completo, ni lo menciones. [FIN] es solo cuando NO hay nada del embudo que contestar.${
    conTypo
      ? seCorrige
        ? `

En ESTA respuesta: comete UNA pequeña falta de dedo en una palabra del primer mensaje (ideal en el nombre o una palabra común) y corrígete en el segundo mensaje con humor breve. Ejemplo del estilo: "hola toy" ||| "perdon, roy jaja te paso el link...". Solo un error, sutil, nada exagerado.`
        : `

En ESTA respuesta: comete UNA pequeña falta de dedo en una palabra (letras cambiadas o comidas por escribir rápido, ej. "cusro", "graicas", "entocnes") y NO la corrijas — déjala así, como quien escribe rápido y ni se fija. Solo un error, sutil.`
      : ""
  }`;

  const messages = (history ?? [])
    .slice()
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({
      role: (m.direction === "in" ? "user" : "assistant") as "user" | "assistant",
      content: m.content as string,
    }));

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: settings.model,
    max_tokens: settings.max_tokens,
    system: systemPrompt,
    messages,
  });

  const replyText = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("\n")
    .trim();

  // [FIN] = la IA decidió que lo correcto es NO contestar (la persona cerró
  // la plática). No se guarda ni se manda nada.
  if (/^\[?FIN\]?$/i.test(replyText.replace(/[[\]().\s]/g, "")) || replyText.includes("[FIN]")) {
    const costFin = estimateCostUsd(settings.model, response.usage.input_tokens, response.usage.output_tokens);
    await supabase.from("token_usage_logs").insert({
      conversation_id: conversationId,
      message_id: null,
      model: settings.model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_usd: costFin,
    });
    return { mensajes: [], replyText: "" };
  }

  // la respuesta puede venir en varios mensajes separados por ||| (chat real);
  // un renglón vacío también corta — a veces el modelo separa así sus burbujas
  const partes = replyText
    .split(/\n?\s*\|\|\|\s*\n?|\n{2,}/)
    .map((p) => humanizarTexto(p.trim()))
    .filter(Boolean)
    .slice(0, 3);

  const mensajes: { messageId: string; text: string }[] = [];
  for (const parte of partes) {
    const { data: aiMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        contact_id: contactId,
        channel,
        direction: "out",
        sender_type: "ai",
        content: parte,
      })
      .select()
      .single();
    if (insertError) throw insertError;
    mensajes.push({ messageId: aiMessage.id as string, text: parte });
  }

  const costUsd = estimateCostUsd(settings.model, response.usage.input_tokens, response.usage.output_tokens);
  await supabase.from("token_usage_logs").insert({
    conversation_id: conversationId,
    message_id: mensajes[0]?.messageId ?? null,
    model: settings.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: costUsd,
  });

  return { mensajes, replyText };
}
