import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

const HISTORY_LIMIT = 10;

type ChatMessage = { role: "user" | "assistant"; content: string };

async function getRelevanceSettings() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("assistant_settings")
    .select("relevance_filter_enabled, relevance_filter_prompt")
    .eq("id", 1)
    .single();
  return data;
}

async function classifyRelevance(prompt: string, history: ChatMessage[]): Promise<boolean> {
  const systemPrompt = `${prompt}

Se te va a mostrar la conversación completa reciente. Analiza el ÚLTIMO mensaje del cliente (el más reciente), pero usa el resto de la conversación como contexto: si ya venían hablando de negocio, un mensaje ambiguo por sí solo (ej. confirmar un número de personas, decir "sí"/"ok", dar un dato que se pidió) sigue siendo parte de esa conversación de negocio, aunque no repita palabras clave.`;

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

  return text.startsWith("SI");
}

// Antes de dejar que la IA conteste, le pregunta a Claude si el mensaje es
// sobre los servicios de VITA RESCUE o es personal — para que la IA no se
// meta en la vida personal de Roy en sus redes. Usa el historial reciente
// de la conversación como contexto (ver classifyRelevance).
export async function isBusinessRelevant(conversationId: string, content: string | null): Promise<boolean> {
  if (!content) return false;

  const settings = await getRelevanceSettings();
  if (!settings?.relevance_filter_enabled) return true; // filtro apagado: deja pasar todo

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

  return classifyRelevance(settings.relevance_filter_prompt, messages.length > 0 ? messages : [{ role: "user", content }]);
}

// Misma lógica, pero para el chat de prueba (sin conversación real en la base
// de datos) — recibe el historial directo desde el front en vez de leerlo de Supabase.
export async function isBusinessRelevantForHistory(history: ChatMessage[]): Promise<boolean> {
  if (history.length === 0) return false;

  const settings = await getRelevanceSettings();
  if (!settings?.relevance_filter_enabled) return true;

  return classifyRelevance(settings.relevance_filter_prompt, history);
}
