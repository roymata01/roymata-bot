import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSystemPrompt } from "@/lib/ai/build-system-prompt";
import { estimateCostUsd } from "@/lib/ai/pricing";

// Igual que generateAiReply, pero para el chat de prueba: no toca contacts/
// conversations/messages (no es un cliente real) — sí registra el costo en
// token_usage_logs porque es una llamada real y cuesta dinero de verdad.
export async function generateTestReply(
  history: { role: "user" | "assistant"; content: string }[],
  customerName?: string | null
) {
  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("assistant_settings").select("model, max_tokens").eq("id", 1).single();
  if (!settings) throw new Error("No se encontró la configuración del asistente");

  const knowledgeBasePrompt = await buildSystemPrompt();
  const systemPrompt = `${knowledgeBasePrompt}

## Con quién estás hablando
${customerName ? `Su nombre/usuario es: ${customerName}.` : "No sabes su nombre todavía."} Si el nombre indica claramente el género (ej. un nombre de mujer), NO uses "bro" ni "hermano" — usa el nombre directamente o un término neutral. Si el nombre no deja claro el género, usa lenguaje neutral sin género en vez de asumir.`;

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: settings.model,
    max_tokens: settings.max_tokens,
    system: systemPrompt,
    messages: history,
  });

  const replyText = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("\n")
    .trim();

  const costUsd = estimateCostUsd(settings.model, response.usage.input_tokens, response.usage.output_tokens);
  await supabase.from("token_usage_logs").insert({
    model: settings.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: costUsd,
  });

  return replyText;
}
