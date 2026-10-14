import { createAdminClient } from "@/lib/supabase/admin";
import { estaExcluido } from "@/lib/inbox/handle-facebook-comment";
import { roySigueAlUsuario } from "@/lib/meta/fetch-profile";
import { nombreDesdeUsername } from "@/lib/ai/name-from-username";
import { sendInstagramPrivateReply } from "@/lib/meta/send-private-reply";
import { replyToInstagramComment } from "@/lib/meta/reply-to-comment";
import { burbujasDeNodo, TAG_FLUJO_QUIERO, USUARIO_PRUEBA_ROY } from "@/lib/flujo/quiero";
import type { InstagramComment } from "@/lib/meta/parse-comment-webhook";

// FLUJO QUIERO (dictado de Roy 14-oct-2026): alguien comenta QUIERO en el
// video del Método HÉROE -> DM de arranque ("vi que comentaste quiero...").
// El resto del embudo lo sigue la IA con el playbook (lib/flujo/quiero.ts)
// y el sí-corto determinista de process-inbound.
//
// Con el bot PAUSADO solo pasa la cuenta de prueba de Roy (@rodrigo.mataa):
// así se prueba el flujo completo sin tocar a la audiencia real.
export async function handleComentarioQuiero(comment: InstagramComment) {
  if (comment.userId === process.env.IG_BUSINESS_ACCOUNT_ID) return;

  const supabase = createAdminClient();
  const esPrueba = comment.username === USUARIO_PRUEBA_ROY;

  const { data: settings } = await supabase
    .from("assistant_settings").select("is_paused").eq("id", 1).single();
  if (settings?.is_paused && !esPrueba) return;

  // A diferencia de la invitación general, aquí NO se excluye a la gente que
  // Roy sigue: comentar QUIERO es pedir el video explícitamente (Roy 14-oct,
  // "sirve igual para las personas que sigo?"). La lista manual de excluidos
  // sí se respeta.
  if (await estaExcluido(supabase, "instagram", comment.username)) return;

  // Un DM por persona, para siempre: mismo candado que las invitaciones
  // (índice único comment_invites(channel, ig_user_id)).
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
    if (insertError.code === "23505") return; // ya se le escribió antes
    throw insertError;
  }

  const nombre = comment.username ? await nombreDesdeUsername(comment.username) : null;
  const burbujas = await burbujasDeNodo("dm-inicial", nombre);
  if (burbujas.length === 0) return;
  // Meta solo permite UN mensaje de respuesta privada a un comentario (los
  // mensajes extra rebotan hasta que la persona conteste) — así que el DM de
  // arranque completo va en un solo mensaje, con las burbujas como renglones.
  const textoDm = burbujas.join("\n");

  try {
    let resultado;
    try {
      resultado = await sendInstagramPrivateReply(comment.commentId, textoDm);
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
      resultado = await sendInstagramPrivateReply(comment.commentId, textoDm);
    }
    await supabase.from("comment_invites").update({ status: "sent" }).eq("id", invite.id);

    // Respuesta PÚBLICA al comentario (Roy 14-oct): "ya te lo mande por dm",
    // una versión al azar de las 10 editables en /flujo — los demás ven que
    // comentar QUIERO funciona. Si falla, el DM ya salió: no se relanza.
    try {
      const versiones = await burbujasDeNodo("reply-publico", nombre);
      if (versiones.length > 0) {
        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000));
        await replyToInstagramComment(comment.commentId, versiones[Math.floor(Math.random() * versiones.length)]);
      }
    } catch (e) {
      console.error("Flujo QUIERO: respuesta pública falló:", e);
    }

    if (resultado.recipientId) {
      // Contacto con @usuario + etiqueta del flujo (la etiqueta es lo que
      // activa el playbook y el sí-corto en los mensajes que vengan).
      const { data: existente } = await supabase
        .from("contacts")
        .select("id, tags")
        .eq("channel", "instagram")
        .eq("external_id", resultado.recipientId)
        .maybeSingle();
      const tags = Array.from(new Set([...(existente?.tags ?? []), TAG_FLUJO_QUIERO]));
      const { data: contacto } = await supabase
        .from("contacts")
        .upsert(
          {
            channel: "instagram",
            external_id: resultado.recipientId,
            tags,
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
  } catch (error) {
    console.error(`Flujo QUIERO: DM a @${comment.username} falló:`, error);
    await supabase.from("comment_invites").update({ status: "failed", error: String(error) }).eq("id", invite.id);
  }
}
