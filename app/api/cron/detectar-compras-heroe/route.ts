import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import { burbujasDeNodo, TAG_FLUJO_QUIERO } from "@/lib/flujo/quiero";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TAG_ALUMNO = "heroe-alumno";
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// Detección de compras del Método HÉROE (Roy 14-oct): cruza a la gente del
// flujo QUIERO con los alumnos reales (heroe_alumnos, por el correo que
// dieron en la plática). Al detectar la compra: felicitación en el chat
// (nodo editable en /flujo) + etiqueta heroe-alumno, que APAGA toda la
// presión (insistidas, seguimientos) y pone a la IA en modo soporte.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: ajustes } = await supabase.from("assistant_settings").select("is_paused").eq("id", 1).single();
  if (ajustes?.is_paused) return NextResponse.json({ pausado: true });

  // Gente del flujo que aún no está marcada como alumno
  const { data: contactos } = await supabase
    .from("contacts")
    .select("id, channel, external_id, display_name, tags")
    .contains("tags", [TAG_FLUJO_QUIERO])
    .limit(200);
  const candidatos = (contactos ?? []).filter((c) => !(c.tags ?? []).includes(TAG_ALUMNO));

  const detectados: string[] = [];
  for (const contacto of candidatos) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contacto.id)
      .eq("channel", contacto.channel)
      .maybeSingle();
    if (!conv) continue;

    // Correos de esta persona: lo capturado en lista_espera + lo que haya
    // escrito en el chat (sus mensajes entrantes con @)
    const correos = new Set<string>();
    const { data: enLista } = await supabase
      .from("lista_espera_gen2")
      .select("correo")
      .eq("conversation_id", conv.id)
      .maybeSingle();
    if (enLista?.correo) correos.add(enLista.correo.toLowerCase());
    const { data: conArroba } = await supabase
      .from("messages")
      .select("content")
      .eq("conversation_id", conv.id)
      .eq("direction", "in")
      .ilike("content", "%@%")
      .order("created_at", { ascending: false })
      .limit(20);
    for (const m of conArroba ?? []) {
      for (const match of String(m.content ?? "").matchAll(EMAIL_RE)) correos.add(match[0].toLowerCase());
    }
    if (correos.size === 0) continue;

    // ¿Alguno de esos correos ya es alumno?
    let alumno: { email: string; nombre: string | null } | null = null;
    for (const correo of correos) {
      const { data } = await supabase
        .from("heroe_alumnos")
        .select("email, nombre")
        .ilike("email", correo)
        .eq("activo", true)
        .maybeSingle();
      if (data) {
        alumno = data;
        break;
      }
    }
    if (!alumno) continue;

    // 1. Etiqueta: apaga la presión aunque el mensaje de abajo falle
    const tags = Array.from(new Set([...(contacto.tags ?? []), TAG_ALUMNO]));
    await supabase.from("contacts").update({ tags }).eq("id", contacto.id);

    // 2. Felicitación (texto editable en /flujo; {nombre} = su primer nombre)
    const nombre =
      alumno.nombre?.trim().split(/\s+/)[0] ??
      contacto.display_name?.replace(/^@/, "").trim().split(/\s+/)[0] ??
      null;
    const burbujas = await burbujasDeNodo("felicitacion", nombre);
    for (const [i, texto] of burbujas.entries()) {
      const { data: msg } = await supabase
        .from("messages")
        .insert({
          conversation_id: conv.id,
          contact_id: contacto.id,
          channel: contacto.channel,
          direction: "out",
          sender_type: "ai",
          content: texto,
        })
        .select()
        .single();
      if (!msg) break;
      try {
        const mid = await sendForChannel(contacto.channel, contacto.external_id, texto);
        await supabase.from("messages").update({ status: "sent", meta_message_id: mid }).eq("id", msg.id);
      } catch (e) {
        // fuera de la ventana de 24h de Meta: la etiqueta ya apagó la presión,
        // la felicitación simplemente no sale — no es grave
        console.error("Felicitación HÉROE no se pudo enviar:", contacto.display_name, e);
        await supabase.from("messages").delete().eq("id", msg.id);
        break;
      }
      if (i < burbujas.length - 1) await new Promise((r) => setTimeout(r, 5000));
    }

    detectados.push(`${contacto.display_name ?? contacto.id} → ${alumno.email}`);
  }

  return NextResponse.json({ revisados: candidatos.length, compras_detectadas: detectados.length, detalle: detectados });
}
