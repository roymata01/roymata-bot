import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import { gritoNombre, lineaInsistida } from "@/lib/ai/generar-insistida";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Insistida de visto (Roy 2026-10-07): si el bot contestó y la persona lleva
// 5+ horas sin responder, se le insiste UNA vez con dos mensajes humanos:
// "Brendaaa" y luego una línea retomando lo pendiente. Corre cada hora.
//
// Candados:
// - solo conversaciones con IA activa donde lo último que se dijo fue nuestro
//   y lo dijo la IA (si Roy escribió a mano, no nos metemos)
// - una insistida por silencio: si ya hay un mensaje nuestro mandado >1 h
//   después de su último inbound (o sea, un seguimiento tardío), no se repite
// - WhatsApp solo dentro de la ventana de 24 h (si no, la API acepta pero
//   Meta no entrega — lección del 5-oct)
// - horario humano: solo entre 9:00 y 21:59 CDMX
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function horaCdmx(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", hour: "numeric", hour12: false }).format(new Date())
  );
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const hora = horaCdmx();
  if (hora < 9 || hora >= 22) return NextResponse.json({ dormido: true, hora });

  const supabase = createAdminClient();
  const ahora = Date.now();
  const hace5h = new Date(ahora - 5 * 3600_000).toISOString();
  const hace16h = new Date(ahora - 16 * 3600_000).toISOString();

  const { data: candidatas } = await supabase
    .from("conversations")
    .select("id, channel, contact_id, ai_enabled, last_message_at, last_inbound_at, contacts(external_id, display_name)")
    .eq("ai_enabled", true)
    .not("last_inbound_at", "is", null)
    .lt("last_message_at", hace5h)
    .gt("last_message_at", hace16h)
    .limit(200);

  const insistidas: string[] = [];
  for (const conv of candidatas ?? []) {
    if (insistidas.length >= 10) break;
    const lastIn = new Date(conv.last_inbound_at as string).getTime();
    const lastMsg = new Date(conv.last_message_at as string).getTime();
    if (lastMsg <= lastIn) continue; // la última palabra la tiene él, no nosotros

    // WhatsApp: fuera de la ventana de 24 h no se entrega — margen de 2 h
    if (conv.channel === "whatsapp" && ahora - lastIn > 22 * 3600_000) continue;

    const contacto = conv.contacts as unknown as { external_id: string; display_name: string | null } | null;
    if (!contacto?.external_id) continue;

    // Lo último dicho debe ser de la IA, y sin insistida previa en este silencio
    const { data: salientes } = await supabase
      .from("messages")
      .select("sender_type, created_at")
      .eq("conversation_id", conv.id)
      .eq("direction", "out")
      .gt("created_at", conv.last_inbound_at as string)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!salientes?.length || salientes[0].sender_type !== "ai") continue;
    const yaInsistida = salientes.some(
      (m) => new Date(m.created_at as string).getTime() - lastIn > 3600_000
    );
    if (yaInsistida) continue;

    const linea = await lineaInsistida(conv.id);
    if (!linea) continue;
    const burbujas = [gritoNombre(contacto.display_name), linea];

    let ok = true;
    for (const [i, texto] of burbujas.entries()) {
      const { data: msg, error: eIns } = await supabase
        .from("messages")
        .insert({
          conversation_id: conv.id,
          contact_id: conv.contact_id,
          channel: conv.channel,
          direction: "out",
          sender_type: "ai",
          content: texto,
        })
        .select()
        .single();
      if (eIns || !msg) { ok = false; break; }
      try {
        const mid = await sendForChannel(conv.channel, contacto.external_id, texto);
        await supabase.from("messages").update({ status: "sent", meta_message_id: mid }).eq("id", msg.id);
      } catch (e) {
        console.error("Insistida: fallo enviando", conv.id, e);
        await supabase.from("messages").update({ status: "failed" }).eq("id", msg.id);
        ok = false;
        break;
      }
      if (i === 0) await espera(4000); // pausa humana entre el grito y la línea
    }
    if (ok) insistidas.push(conv.id as string);
    await espera(1500);
  }

  return NextResponse.json({ insistidas: insistidas.length, conversaciones: insistidas });
}
