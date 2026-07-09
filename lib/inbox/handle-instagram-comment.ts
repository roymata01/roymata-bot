import { createAdminClient } from "@/lib/supabase/admin";
import { sendInstagramPrivateReply } from "@/lib/meta/send-private-reply";
import type { InstagramComment } from "@/lib/meta/parse-comment-webhook";

// {nombre} -> @usuario de quien comentó. Los comentarios de Instagram solo traen el
// @usuario (no el nombre real). Si Meta no lo mandó, el marcador se quita limpio
// junto con el espacio que lo precede ("Hey {nombre}!" queda "Hey!").
function personalizeInvite(text: string, username: string | null): string {
  if (username) return text.replaceAll("{nombre}", `@${username}`);
  return text.replace(/\s*\{nombre\}/g, "");
}

// Invitación por comentario: alguien comenta en un post -> se le manda UN mensaje
// privado invitándolo a la clase de hemorragias. El eco de ese DM llega por el
// webhook de mensajes y crea solo la conversación en la bandeja, así que la
// respuesta del interesado cae con la IA activa como cualquier chat nuevo.
export async function handleInstagramComment(comment: InstagramComment) {
  // nunca contestarse a sí mismo (respuestas de Roy a comentarios)
  if (comment.userId === process.env.IG_BUSINESS_ACCOUNT_ID) return;

  const supabase = createAdminClient();

  const { data: settings } = await supabase.from("assistant_settings").select("*").eq("id", 1).single();
  const config = settings as { comment_dm_enabled?: boolean; comment_dm_text?: string; is_paused?: boolean } | null;
  // el apagado de emergencia (is_paused) también frena las invitaciones
  if (!config?.comment_dm_enabled || !config.comment_dm_text || config.is_paused) return;

  // Dedupe por persona: el índice único de comment_invites(channel, ig_user_id) es la
  // fuente de verdad — si ya se le escribió alguna vez, el insert choca y se descarta.
  const { data: invite, error: insertError } = await supabase
    .from("comment_invites")
    .insert({
      channel: "instagram",
      comment_id: comment.commentId,
      media_id: comment.mediaId,
      ig_user_id: comment.userId,
      username: comment.username,
      comment_text: comment.text,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") return; // ya invitado antes
    throw insertError;
  }

  try {
    await sendInstagramPrivateReply(comment.commentId, personalizeInvite(config.comment_dm_text, comment.username));
    await supabase.from("comment_invites").update({ status: "sent" }).eq("id", invite.id);
  } catch (error) {
    // no se relanza: un DM fallido no debe hacer que Meta reintente el webhook
    console.error(`Error enviando invitación por comentario a @${comment.username}:`, error);
    await supabase.from("comment_invites").update({ status: "failed", error: String(error) }).eq("id", invite.id);
  }
}
