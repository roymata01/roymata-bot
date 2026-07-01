import { createAdminClient } from "@/lib/supabase/admin";

export async function buildSystemPrompt(): Promise<string> {
  const supabase = createAdminClient();

  const { data: sections, error } = await supabase
    .from("knowledge_base_sections")
    .select("title, content")
    .eq("is_active", true)
    .order("order_index", { ascending: true });
  if (error) throw error;

  return (sections ?? [])
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n");
}
