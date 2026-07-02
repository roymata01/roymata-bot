import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

const HISTORY_LIMIT = 10;

export type MessageCategory = "emergencia" | "negocio" | "personal";
type ChatMessage = { role: "user" | "assistant"; content: string };

async function getClassifierSettings() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("assistant_settings")
    .select("relevance_filter_enabled, relevance_filter_prompt")
    .eq("id", 1)
    .single();
  return data;
}

async function runClassifier(prompt: string, history: ChatMessage[]): Promise<MessageCategory> {
  const systemPrompt = `${prompt}

Se te va a mostrar la conversación reciente. Clasifica el ÚLTIMO mensaje del cliente en UNA sola categoría, usando el resto de la conversación como contexto (un mensaje ambiguo por sí solo puede quedar claro con el contexto anterior):

- EMERGENCIA: describe una situación médica real y ACTIVA ocurriendo ahora mismo (alguien no respira, sangrado severo activo, convulsión en curso, atragantamiento activo, inconsciente, etc.). Preguntar por un curso o servicio relacionado con estos temas (ej. "quiero el curso de control de hemorragias") NO es una emergencia, es NEGOCIO.
- NEGOCIO: trata sobre cursos, productos, servicios, precios, cotizaciones, la clase gratis de hemorragias, o hay interés real en ellos.
- PERSONAL: cualquier otra cosa — mensajes personales, comentarios casuales, temas no relacionados, spam.

Responde ÚNICAMENTE con una palabra: EMERGENCIA, NEGOCIO, o PERSONAL.`;

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 5,
    system: systemPrompt,
    messages: history,
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("")
    .trim()
    .toUpperCase();

  if (text.startsWith("EMERG")) return "emergencia";
  if (text.startsWith("NEG")) return "negocio";
  return "personal";
}

// Clasifica un mensaje real (con historial de Supabase). Si el filtro está
// apagado, deja pasar todo como "negocio" (el chequeo de palabras clave de
// checkEscalation sigue corriendo aparte, siempre).
export async function classifyMessage(conversationId: string, content: string | null): Promise<MessageCategory> {
  if (!content) return "personal";

  const settings = await getClassifierSettings();
  if (!settings?.relevance_filter_enabled) return "negocio";

  const supabase = createAdminClient();
  const { data: history } = await supabase
    .from("messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const messages: ChatMessage[] = (history ?? [])
    .slice()
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({ role: m.direction === "in" ? "user" : "assistant", content: m.content as string }));

  return runClassifier(settings.relevance_filter_prompt, messages.length > 0 ? messages : [{ role: "user", content }]);
}

// Misma lógica para el chat de prueba (sin conversación real en la base de datos).
export async function classifyMessageForHistory(history: ChatMessage[]): Promise<MessageCategory> {
  if (history.length === 0) return "personal";
  const settings = await getClassifierSettings();
  if (!settings?.relevance_filter_enabled) return "negocio";
  return runClassifier(settings.relevance_filter_prompt, history);
}
