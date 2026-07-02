import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

// Antes de dejar que la IA conteste, le pregunta a Claude si el mensaje es
// sobre los servicios de VITA RESCUE o es personal — para que la IA no se
// meta en la vida personal de Roy en sus redes.
export async function isBusinessRelevant(content: string | null): Promise<boolean> {
  if (!content) return false;

  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("assistant_settings")
    .select("relevance_filter_enabled, relevance_filter_prompt")
    .eq("id", 1)
    .single();

  if (!settings?.relevance_filter_enabled) return true; // filtro apagado: deja pasar todo

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 5,
    system: settings.relevance_filter_prompt,
    messages: [{ role: "user", content }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("")
    .trim()
    .toUpperCase();

  return text.startsWith("SI");
}
