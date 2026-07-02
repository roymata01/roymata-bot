import { createAdminClient } from "@/lib/supabase/admin";
import type { Channel } from "@/types/database";

interface TriggerConfig {
  keywords?: string[];
  channel?: Channel | null;
}

interface TagActionConfig {
  tag?: string;
}

// Evalúa los workflows activos contra un mensaje entrante. Corre después del
// apagado de emergencia por palabras clave (assistant_settings) y antes de
// generar la respuesta de IA — así una regla "disable_ai" puede frenarla.
export async function runWorkflows(params: {
  conversationId: string;
  contactId: string;
  messageId: string;
  channel: Channel;
  content: string | null;
}): Promise<{ blockAiReply: boolean }> {
  if (!params.content) return { blockAiReply: false };

  const supabase = createAdminClient();
  const { data: workflows } = await supabase
    .from("workflows")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  const normalized = params.content.toLowerCase();
  let blockAiReply = false;

  for (const workflow of workflows ?? []) {
    if (workflow.trigger_type !== "contains_keyword" && workflow.trigger_type !== "emergency_keyword") continue;

    const triggerConfig = workflow.trigger_config as TriggerConfig;
    if (triggerConfig.channel && triggerConfig.channel !== params.channel) continue;

    const keywords = triggerConfig.keywords ?? [];
    const matched = keywords.some((k) => k && normalized.includes(k.toLowerCase()));
    if (!matched) continue;

    if (workflow.action_type === "tag") {
      const tag = (workflow.action_config as TagActionConfig).tag;
      if (tag) {
        const { data: contact } = await supabase.from("contacts").select("tags").eq("id", params.contactId).single();
        const tags = Array.from(new Set([...(contact?.tags ?? []), tag]));
        await supabase.from("contacts").update({ tags }).eq("id", params.contactId);
      }
    } else if (workflow.action_type === "disable_ai") {
      await supabase
        .from("conversations")
        .update({ status: "por_atender", ai_enabled: false })
        .eq("id", params.conversationId);
      blockAiReply = true;
    } else if (workflow.action_type === "notify") {
      await supabase.from("conversations").update({ status: "por_atender" }).eq("id", params.conversationId);
    }

    await supabase.from("workflow_executions").insert({
      workflow_id: workflow.id,
      conversation_id: params.conversationId,
      message_id: params.messageId,
    });
  }

  return { blockAiReply };
}
