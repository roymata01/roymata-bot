import { createAdminClient } from "@/lib/supabase/admin";

// Si el mensaje entrante contiene una palabra clave de emergencia, apaga la IA
// y marca la conversación como "por atender" — no debe quedar un caso urgente solo con el bot.
export async function checkEscalation(conversationId: string, messageContent: string | null): Promise<boolean> {
  if (!messageContent) return false;

  const supabase = createAdminClient();

  const { data: settings, error } = await supabase
    .from("assistant_settings")
    .select("escalation_keywords")
    .eq("id", 1)
    .single();
  if (error) throw error;

  const normalized = messageContent.toLowerCase();
  const matched = (settings.escalation_keywords ?? []).some((keyword: string) =>
    normalized.includes(keyword.toLowerCase())
  );
  if (!matched) return false;

  const { error: updateError } = await supabase
    .from("conversations")
    .update({ status: "por_atender", ai_enabled: false })
    .eq("id", conversationId);
  if (updateError) throw updateError;

  return true;
}
