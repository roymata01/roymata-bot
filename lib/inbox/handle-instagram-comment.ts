import { createAdminClient } from "@/lib/supabase/admin";
import { nombreDesdeUsername } from "@/lib/ai/name-from-username";
import { conRef } from "@/lib/meta/link-ref";
import { replyToInstagramComment, respuestaPublicaAleatoria } from "@/lib/meta/reply-to-comment";
import { sendInstagramPrivateReply } from "@/lib/meta/send-private-reply";
import type { InstagramComment } from "@/lib/meta/parse-comment-webhook";

// {nombre} -> nombre humano extraído del @usuario con IA ("eduardonolasco51" ->
// "Eduardo"). Si el username no trae nombre reconocible, el marcador se quita
// limpio junto con el espacio que lo precede ("Hey {nombre}!" queda "Hey!") —
// regla de Roy: nunca saludar con el username crudo.
function personalizeInvite(text: string, nombre: string | null): string {
  if (nombre) return text.replaceAll("{nombre}", nombre);
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

  const nombre = comment.username ? await nombreDesdeUsername(comment.username) : null;
  // el link lleva el ref de la invitación: si esta persona se registra, el
  // registro queda ligado a este DM (atribución del bot)
  const texto = conRef(personalizeInvite(config.comment_dm_text, nombre), `ci_${invite.id}`);
  try {
    let resultado;
    try {
      resultado = await sendInstagramPrivateReply(comment.commentId, texto);
    } catch {
      // Meta a veces responde 500 transitorio; un solo reintento lo suele salvar
      await new Promise((r) => setTimeout(r, 3000));
      resultado = await sendInstagramPrivateReply(comment.commentId, texto);
    }
    await supabase.from("comment_invites").update({ status: "sent" }).eq("id", invite.id);

    // Guarda el contacto ya con su @usuario (la respuesta trae el IGSID de
    // mensajería) — así la bandeja muestra nombre desde el primer momento — y
    // liga la invitación a su conversación (para el rastreo de registros).
    if (resultado.recipientId) {
      const { data: contacto } = await supabase
        .from("contacts")
        .upsert(
          {
            channel: "instagram",
            external_id: resultado.recipientId,
            ...(comment.username ? { display_name: `@${comment.username}` } : {}),
          },
          { onConflict: "channel,external_id" }
        )
        .select()
        .single();
      if (contacto) {
        const { data: conversacion } = await supabase
          .from("conversations")
          .upsert({ contact_id: contacto.id, channel: "instagram" }, { onConflict: "contact_id,channel" })
          .select()
          .single();
        if (conversacion) {
          await supabase.from("comment_invites").update({ conversation_id: conversacion.id }).eq("id", invite.id);
        }
      }
    }

    // Respuesta pública al comentario: manda a la persona a su bandeja y les
    // enseña a los demás que comentando reciben algo. Si falla, no pasa nada.
    try {
      await replyToInstagramComment(comment.commentId, respuestaPublicaAleatoria());
    } catch (error) {
      console.error("Error en respuesta pública de Instagram:", error);
    }
  } catch (error) {
    // no se relanza: un DM fallido no debe hacer que Meta reintente el webhook
    console.error(`Error enviando invitación por comentario a @${comment.username}:`, error);
    await supabase.from("comment_invites").update({ status: "failed", error: String(error) }).eq("id", invite.id);
  }
}
