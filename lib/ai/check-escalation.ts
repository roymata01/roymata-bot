import { createAdminClient } from "@/lib/supabase/admin";
import { escalateConversation } from "@/lib/ai/escalate-conversation";

// Chequeo rápido y barato por palabras clave muy inequívocas (911, "no respira",
// etc.) — corre antes del clasificador con IA para los casos más obvios.
// Las palabras deben ser específicas de una emergencia activa, no temas de
// curso (ej. "hemorragia" sola rompería con el curso de control de hemorragias).
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

  await escalateConversation(conversationId);
  return true;
}
