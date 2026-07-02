import { createAdminClient } from "@/lib/supabase/admin";

// Apaga la IA y marca la conversación como "por atender" — no debe quedar
// un caso urgente solo con el bot. Compartido por el chequeo de palabras
// clave y el clasificador con IA.
export async function escalateConversation(conversationId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status: "por_atender", ai_enabled: false })
    .eq("id", conversationId);
  if (error) throw error;
}
