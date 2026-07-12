import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSystemPrompt } from "@/lib/ai/build-system-prompt";
import { estimateCostUsd } from "@/lib/ai/pricing";
import type { Channel } from "@/types/database";

const HISTORY_LIMIT = 20;

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
    supabase.from("contacts").select("display_name, phone").eq("id", contactId).single(),
  ]);
  if (settingsError) throw settingsError;
  if (historyError) throw historyError;

  const knowledgeBasePrompt = await buildSystemPrompt();
  const contactName = contact?.display_name || contact?.phone || null;
  const systemPrompt = `${knowledgeBasePrompt}

## Con quién estás hablando
${contactName ? `Su nombre/usuario es: ${contactName}.` : "No sabes su nombre todavía."} Si el nombre indica claramente el género (ej. un nombre de mujer), NO uses "bro" ni "hermano" — usa el nombre directamente o un término neutral. Si el nombre no deja claro el género (ej. es un @usuario que no lo revela), usa lenguaje neutral sin género en vez de asumir. REGLA DE NOMBRES: NUNCA llames a la persona por su @usuario tal cual. Si el @usuario contiene un nombre de pila obvio (ej. @eduardonolasco51 -> Eduardo), usa ese nombre; si no lo contiene, no uses ningún nombre.`;

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

  const { data: aiMessage, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      contact_id: contactId,
      channel,
      direction: "out",
      sender_type: "ai",
      content: replyText,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  const costUsd = estimateCostUsd(settings.model, response.usage.input_tokens, response.usage.output_tokens);
  await supabase.from("token_usage_logs").insert({
    conversation_id: conversationId,
    message_id: aiMessage.id,
    model: settings.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: costUsd,
  });

  return { messageId: aiMessage.id as string, replyText };
}
