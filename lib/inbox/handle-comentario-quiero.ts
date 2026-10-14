import { createAdminClient } from "@/lib/supabase/admin";
import { estaExcluido } from "@/lib/inbox/handle-facebook-comment";
import { roySigueAlUsuario } from "@/lib/meta/fetch-profile";
import { nombreDesdeUsername } from "@/lib/ai/name-from-username";
import { sendInstagramPrivateReply } from "@/lib/meta/send-private-reply";
import { sendForChannel } from "@/lib/meta/send-message";
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

  // Gente que Roy sigue (colegas, amigos): el bot no les escribe — salvo la
  // cuenta de prueba, que Roy sigue por definición.
  if (!esPrueba && (await roySigueAlUsuario(comment.userId))) return;
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

  try {
    // La primera burbuja va como private reply (la única forma de abrir el DM
    // desde un comentario); las demás, ya con el IGSID, como mensajes normales.
    let resultado;
    try {
      resultado = await sendInstagramPrivateReply(comment.commentId, burbujas[0]);
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
      resultado = await sendInstagramPrivateReply(comment.commentId, burbujas[0]);
    }
    await supabase.from("comment_invites").update({ status: "sent" }).eq("id", invite.id);

    if (resultado.recipientId) {
      for (const burbuja of burbujas.slice(1)) {
        await new Promise((r) => setTimeout(r, 4000 + Math.random() * 3000));
        try {
          await sendForChannel("instagram", resultado.recipientId, burbuja);
        } catch (e) {
          console.error("Flujo QUIERO: burbuja extra falló:", e);
          break;
        }
      }

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
