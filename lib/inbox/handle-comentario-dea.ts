import { createAdminClient } from "@/lib/supabase/admin";
import { estaExcluido } from "@/lib/inbox/handle-facebook-comment";
import { nombreDesdeUsername } from "@/lib/ai/name-from-username";
import { sendInstagramPrivateReply, sendMessengerPrivateReply } from "@/lib/meta/send-private-reply";
import { replyToInstagramComment } from "@/lib/meta/reply-to-comment";
import { USUARIO_PRUEBA_ROY } from "@/lib/flujo/quiero";
import { burbujasDeNodoDea, TAG_FLUJO_DEA } from "@/lib/flujo/dea";

// FLUJO DEA (pedido de Roy 8-nov-2026): alguien comenta DEA en el video de
// la masterclass de diciembre -> DM con el link de registro (la clase es
// gratis, así que el link va de una vez — ya lo pidieron al comentar).
// Mismas reglas que el flujo QUIERO en Instagram y Facebook; el resto del
// embudo lo sigue la IA con el playbook (lib/flujo/dea.ts).

export type ComentarioDea = {
  channel: "instagram" | "messenger";
  commentId: string;
  mediaId: string | null;
  userId: string;
  /** @usuario en Instagram; nombre real en Facebook */
  username: string | null;
  text: string | null;
};

export async function handleComentarioDea(comment: ComentarioDea) {
  const esIg = comment.channel === "instagram";
  // nunca contestarse a sí mismo
  if (esIg && comment.userId === process.env.IG_BUSINESS_ACCOUNT_ID) return;
  if (!esIg && comment.userId === process.env.FB_PAGE_ID) return;

  const supabase = createAdminClient();
  const esPrueba = esIg && comment.username === USUARIO_PRUEBA_ROY;

  const { data: settings } = await supabase
    .from("assistant_settings").select("is_paused").eq("id", 1).single();
  if (settings?.is_paused && !esPrueba) return;

  // Comentar DEA es pedir el registro explícitamente: no se excluye a quien
  // Roy sigue. La lista manual de excluidos sí se respeta en ambos canales.
  if (await estaExcluido(supabase, comment.channel, comment.username)) return;

  // Un DM por persona POR CAMPAÑA (índice único comment_invites(channel,
  // ig_user_id, flujo) — SQL supabase-flujo-dea.sql). Paracaídas: si la
  // columna flujo aún no existe, se inserta al estilo viejo para no tirar
  // la campaña (dedupe compartido con QUIERO hasta correr el SQL).
  let { data: invite, error: insertError } = await supabase
    .from("comment_invites")
    .insert({
      channel: comment.channel,
      comment_id: comment.commentId,
      media_id: comment.mediaId,
      ig_user_id: comment.userId, // id de usuario del canal (la columna se llama así por IG)
      username: comment.username,
      comment_text: comment.text,
      status: "pending",
      flujo: "dea",
    })
    .select()
    .single();
  if (insertError && /flujo/.test(insertError.message ?? "")) {
    ({ data: invite, error: insertError } = await supabase
      .from("comment_invites")
      .insert({
        channel: comment.channel,
        comment_id: comment.commentId,
        media_id: comment.mediaId,
        ig_user_id: comment.userId,
        username: comment.username,
        comment_text: comment.text,
        status: "pending",
      })
      .select()
      .single());
  }
  if (insertError) {
    if (insertError.code === "23505") return; // ya se le escribió en esta campaña
    throw insertError;
  }
  if (!invite) return;

  // Nombre: en FB viene el nombre real (primer nombre); en IG se extrae del
  // @usuario con IA — y si no da un nombre decente, sale limpio sin nombre.
  const nombre = esIg
    ? comment.username
      ? await nombreDesdeUsername(comment.username)
      : null
    : comment.username?.trim().split(/\s+/)[0] ?? null;

  const burbujas = await burbujasDeNodoDea("dm-inicial", nombre);
  if (burbujas.length === 0) return;
  // Meta solo permite UN mensaje de respuesta privada a un comentario — el
  // DM completo va en un solo mensaje, burbujas como renglones.
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

    // Respuesta PÚBLICA al comentario (solo Instagram — en Facebook el
    // permiso de comentar en público requiere App Review de Meta).
    if (esIg) {
      try {
        const versiones = await burbujasDeNodoDea("reply-publico", nombre);
        if (versiones.length > 0) {
          await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000));
          await replyToInstagramComment(comment.commentId, versiones[Math.floor(Math.random() * versiones.length)]);
        }
      } catch (e) {
        console.error("Flujo DEA: respuesta pública falló:", e);
      }
    }

    if (resultado.recipientId) {
      // Contacto con nombre + etiqueta del flujo (la etiqueta activa el
      // playbook DEA en los mensajes que vengan).
      const { data: existente } = await supabase
        .from("contacts")
        .select("id, tags")
        .eq("channel", comment.channel)
        .eq("external_id", resultado.recipientId)
        .maybeSingle();
      const tags = Array.from(new Set([...(existente?.tags ?? []), TAG_FLUJO_DEA]));
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
    console.error(`Flujo DEA: DM a ${comment.username} (${comment.channel}) falló:`, error);
    await supabase.from("comment_invites").update({ status: "failed", error: String(error) }).eq("id", invite.id);
  }
}
