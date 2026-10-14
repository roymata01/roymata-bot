import { createAdminClient } from "@/lib/supabase/admin";
import { estaExcluido } from "@/lib/inbox/handle-facebook-comment";
import { nombreDesdeUsername } from "@/lib/ai/name-from-username";
import { sendInstagramPrivateReply, sendMessengerPrivateReply } from "@/lib/meta/send-private-reply";
import { replyToInstagramComment } from "@/lib/meta/reply-to-comment";
import { burbujasDeNodo, TAG_FLUJO_QUIERO, USUARIO_PRUEBA_ROY } from "@/lib/flujo/quiero";

// FLUJO QUIERO (dictado de Roy 14-oct-2026): alguien comenta QUIERO en el
// video del Método HÉROE -> DM de arranque con los textos editables de
// /flujo. Mismas reglas en Instagram y Facebook (pedido de Roy esa noche).
// El resto del embudo lo sigue la IA con el playbook (lib/flujo/quiero.ts)
// y el sí-corto determinista de process-inbound.

export type ComentarioQuiero = {
  channel: "instagram" | "messenger";
  commentId: string;
  mediaId: string | null;
  userId: string;
  /** @usuario en Instagram; nombre real en Facebook */
  username: string | null;
  text: string | null;
};

export async function handleComentarioQuiero(comment: ComentarioQuiero) {
  const esIg = comment.channel === "instagram";
  // nunca contestarse a sí mismo
  if (esIg && comment.userId === process.env.IG_BUSINESS_ACCOUNT_ID) return;
  if (!esIg && comment.userId === process.env.FB_PAGE_ID) return;

  const supabase = createAdminClient();
  const esPrueba = esIg && comment.username === USUARIO_PRUEBA_ROY;

  const { data: settings } = await supabase
    .from("assistant_settings").select("is_paused").eq("id", 1).single();
  if (settings?.is_paused && !esPrueba) return;

  // A diferencia de la invitación general, aquí NO se excluye a la gente que
  // Roy sigue: comentar QUIERO es pedir el video explícitamente. La lista
  // manual de excluidos sí se respeta en ambos canales.
  if (await estaExcluido(supabase, comment.channel, comment.username)) return;

  // Un DM por persona, para siempre (índice único comment_invites(channel, ig_user_id)).
  const { data: invite, error: insertError } = await supabase
    .from("comment_invites")
    .insert({
      channel: comment.channel,
      comment_id: comment.commentId,
      media_id: comment.mediaId,
      ig_user_id: comment.userId, // id de usuario del canal (la columna se llama así por IG)
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

  // Nombre: en FB viene el nombre real (primer nombre); en IG se extrae del
  // @usuario con IA — y si no da un nombre decente, sale limpio sin nombre.
  const nombre = esIg
    ? comment.username
      ? await nombreDesdeUsername(comment.username)
      : null
    : comment.username?.trim().split(/\s+/)[0] ?? null;

  const burbujas = await burbujasDeNodo("dm-inicial", nombre);
  if (burbujas.length === 0) return;
  // Meta solo permite UN mensaje de respuesta privada a un comentario — el
  // DM de arranque completo va en un solo mensaje, burbujas como renglones.
  const textoDm = burbujas.join("\n");
  const privateReply = esIg ? sendInstagramPrivateReply : sendMessengerPrivateReply;

  try {
    let resultado;
    try {
      resultado = await privateReply(comment.commentId, textoDm);
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
      resultado = await privateReply(comment.commentId, textoDm);
    }
    await supabase.from("comment_invites").update({ status: "sent" }).eq("id", invite.id);

    // Respuesta PÚBLICA al comentario: "ya te lo mande por dm" (una versión
    // al azar de las editables en /flujo). Solo Instagram — en Facebook el
    // permiso de comentar en público requiere App Review de Meta.
    if (esIg) {
      try {
        const versiones = await burbujasDeNodo("reply-publico", nombre);
        if (versiones.length > 0) {
          await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000));
          await replyToInstagramComment(comment.commentId, versiones[Math.floor(Math.random() * versiones.length)]);
        }
      } catch (e) {
        console.error("Flujo QUIERO: respuesta pública falló:", e);
      }
    }

    if (resultado.recipientId) {
      // Contacto con nombre + etiqueta del flujo (la etiqueta activa el
      // playbook y el sí-corto en los mensajes que vengan).
      const { data: existente } = await supabase
        .from("contacts")
        .select("id, tags")
        .eq("channel", comment.channel)
        .eq("external_id", resultado.recipientId)
        .maybeSingle();
      const tags = Array.from(new Set([...(existente?.tags ?? []), TAG_FLUJO_QUIERO]));
      const displayName = comment.username ? (esIg ? `@${comment.username}` : comment.username) : undefined;
      const { data: contacto } = await supabase
        .from("contacts")
        .upsert(
          {
            channel: comment.channel,
            external_id: resultado.recipientId,
            tags,
            ...(displayName ? { display_name: displayName } : {}),
          },
          { onConflict: "channel,external_id" }
        )
        .select()
        .single();
      if (contacto) {
        const { data: conversacion } = await supabase
          .from("conversations")
          .upsert({ contact_id: contacto.id, channel: comment.channel }, { onConflict: "contact_id,channel" })
          .select()
          .single();
        if (conversacion) {
          await supabase.from("comment_invites").update({ conversation_id: conversacion.id }).eq("id", invite.id);
        }
      }
    }
  } catch (error) {
    console.error(`Flujo QUIERO: DM a ${comment.username} (${comment.channel}) falló:`, error);
    await supabase.from("comment_invites").update({ status: "failed", error: String(error) }).eq("id", invite.id);
  }
}
