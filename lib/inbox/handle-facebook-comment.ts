import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessengerPrivateReply } from "@/lib/meta/send-private-reply";
import type { FacebookComment } from "@/lib/meta/parse-feed-comment-webhook";

// {nombre} -> primer nombre del comentarista (Facebook sí manda el nombre real,
// a diferencia de Instagram que solo da el @usuario). Sin nombre, el marcador
// se quita limpio junto con el espacio que lo precede.
function personalizeInvite(text: string, name: string | null): string {
  const firstName = name?.trim().split(/\s+/)[0];
  if (firstName) return text.replaceAll("{nombre}", firstName);
  return text.replace(/\s*\{nombre\}/g, "");
}

// Espejo de handle-instagram-comment pero para comentarios en posts de la
// Página de Facebook: un solo DM por persona, nunca a la propia Página,
// respeta el apagado de emergencia y el switch de Personalización.
export async function handleFacebookComment(comment: FacebookComment) {
  if (comment.userId === process.env.FB_PAGE_ID) return; // respuestas de la propia Página

  const supabase = createAdminClient();

  const { data: settings } = await supabase.from("assistant_settings").select("*").eq("id", 1).single();
  const config = settings as { comment_dm_enabled?: boolean; comment_dm_text?: string; is_paused?: boolean } | null;
  if (!config?.comment_dm_enabled || !config.comment_dm_text || config.is_paused) return;

  const { data: invite, error: insertError } = await supabase
    .from("comment_invites")
    .insert({
      channel: "messenger",
      comment_id: comment.commentId,
      media_id: comment.postId,
      ig_user_id: comment.userId, // id de usuario del canal; la columna se llama así por Instagram
      username: comment.userName,
      comment_text: comment.text,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") return; // ya invitado antes
    throw insertError;
  }

  const texto = personalizeInvite(config.comment_dm_text, comment.userName);
  try {
    let resultado;
    try {
      resultado = await sendMessengerPrivateReply(comment.commentId, texto);
    } catch {
      // Meta a veces responde 500 transitorio; un solo reintento lo suele salvar
      await new Promise((r) => setTimeout(r, 3000));
      resultado = await sendMessengerPrivateReply(comment.commentId, texto);
    }
    await supabase.from("comment_invites").update({ status: "sent" }).eq("id", invite.id);

    // La API de perfiles de Messenger está bloqueada sin revisión de Meta, pero
    // aquí tenemos el nombre real (del comentario) y el PSID (de la respuesta):
    // se guarda el contacto ya con nombre para que la bandeja no muestre números.
    if (resultado.recipientId && comment.userName) {
      await supabase
        .from("contacts")
        .upsert(
          { channel: "messenger", external_id: resultado.recipientId, display_name: comment.userName },
          { onConflict: "channel,external_id" }
        );
    }
  } catch (error) {
    // no se relanza: un DM fallido no debe hacer que Meta reintente el webhook
    console.error(`Error enviando invitación por comentario de Facebook a ${comment.userName}:`, error);
    await supabase.from("comment_invites").update({ status: "failed", error: String(error) }).eq("id", invite.id);
  }
}
