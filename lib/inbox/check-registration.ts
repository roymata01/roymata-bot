import { createAdminClient } from "@/lib/supabase/admin";

// ¿Esta conversación ya generó un registro en la página del curso?
// Consulta la base del proyecto vita-rescue (Supabase aparte) buscando
// registros cuyo ref sea la conversación o alguna de sus invitaciones (ci_...).
// Nunca lanza: sin credenciales o con error, se asume que no.
export async function conversacionYaRegistrada(conversationId: string): Promise<boolean> {
  try {
    const url = process.env.VITA_SUPABASE_URL;
    const key = process.env.VITA_SUPABASE_SERVICE_KEY;
    if (!url || !key) return false;

    const supabase = createAdminClient();
    const { data: invites } = await supabase
      .from("comment_invites")
      .select("id")
      .eq("conversation_id", conversationId);

    const refs = [conversationId, ...(invites ?? []).map((i) => `ci_${i.id}`)];
    const res = await fetch(
      `${url}/rest/v1/registrations?select=id&limit=1&ref=in.(${refs.map((r) => `"${r}"`).join(",")})`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.error("Error consultando registros del curso:", error);
    return false;
  }
}
