import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";
import {
  gritoNombre,
  esGrito,
  esPlaticaDeVenta,
  capturarNombreDeLaPlatica,
  lineaInsistida,
} from "@/lib/ai/generar-insistida";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Insistida de visto EN DOS TIEMPOS (Roy 2026-10-07): a las ~5 h de silencio
// se manda SOLO el grito del nombre ("Brendaaa" — con "jaja" si es plática de
// venta). Se espera ~2 h a ver qué contesta; si sigue el silencio, entonces
// va la línea (retome normal o presión de venta). Corre cada hora.
//
// Candados:
// - solo conversaciones con IA activa donde lo último lo dijo la IA
// - una insistida por silencio
// - WhatsApp solo dentro de la ventana de 24 h de Meta
// - horario humano: 9:00–21:59 CDMX
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function horaCdmx(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", hour: "numeric", hour12: false }).format(new Date())
  );
}

type Contacto = { external_id: string; display_name: string | null };

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const hora = horaCdmx();
  if (hora < 9 || hora >= 22) return NextResponse.json({ dormido: true, hora });

  const supabase = createAdminClient();
  const ahora = Date.now();

  async function manda(conv: { id: string; channel: "whatsapp" | "instagram" | "messenger"; contact_id: string }, externalId: string, texto: string): Promise<boolean> {
    const { data: msg, error } = await supabase
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
    if (error || !msg) return false;
    try {
      const mid = await sendForChannel(conv.channel, externalId, texto);
      await supabase.from("messages").update({ status: "sent", meta_message_id: mid }).eq("id", msg.id);
      return true;
    } catch (e) {
      console.error("Insistida: fallo enviando", conv.id, e);
      await supabase.from("messages").update({ status: "failed" }).eq("id", msg.id);
      return false;
    }
  }

  // ---------- FASE 1: el grito (5–16 h de silencio, sin insistida previa) ----------
  const gritos: string[] = [];
  {
    const hace5h = new Date(ahora - 5 * 3600_000).toISOString();
    const hace16h = new Date(ahora - 16 * 3600_000).toISOString();
    const { data: candidatas } = await supabase
      .from("conversations")
      .select("id, channel, contact_id, last_message_at, last_inbound_at, contacts(external_id, display_name)")
      .eq("ai_enabled", true)
      .not("last_inbound_at", "is", null)
      .lt("last_message_at", hace5h)
      .gt("last_message_at", hace16h)
      .limit(200);

    for (const conv of candidatas ?? []) {
      if (gritos.length >= 10) break;
      const lastIn = new Date(conv.last_inbound_at as string).getTime();
      const lastMsg = new Date(conv.last_message_at as string).getTime();
      if (lastMsg <= lastIn) continue; // la última palabra la tiene él
      if (conv.channel === "whatsapp" && ahora - lastIn > 22 * 3600_000) continue;

      const contacto = conv.contacts as unknown as Contacto | null;
      if (!contacto?.external_id) continue;

      const { data: salientes } = await supabase
        .from("messages")
        .select("sender_type, content, created_at")
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

      // nombre: si el display_name no sirve (@catitos12), buscarlo en la plática
      let nombre = contacto.display_name;
      if (gritoNombre(nombre) === "heey") {
        nombre = (await capturarNombreDeLaPlatica(conv.id, conv.contact_id)) ?? nombre;
      }
      const venta = esPlaticaDeVenta((salientes ?? []).map((m) => ({ content: m.content as string | null })));

      if (await manda(conv as never, contacto.external_id, gritoNombre(nombre, venta))) {
        gritos.push(conv.id as string);
      }
      await espera(1500);
    }
  }

  // ---------- FASE 2: la línea (2–8 h después del grito, si sigue el silencio) ----------
  const lineas: string[] = [];
  {
    const hace2h = new Date(ahora - 2 * 3600_000).toISOString();
    const hace8h = new Date(ahora - 8 * 3600_000).toISOString();
    const { data: candidatas } = await supabase
      .from("conversations")
      .select("id, channel, contact_id, last_message_at, last_inbound_at, contacts(external_id, display_name)")
      .eq("ai_enabled", true)
      .not("last_inbound_at", "is", null)
      .lt("last_message_at", hace2h)
      .gt("last_message_at", hace8h)
      .limit(200);

    for (const conv of candidatas ?? []) {
      if (lineas.length >= 10) break;
      const lastIn = new Date(conv.last_inbound_at as string).getTime();
      const lastMsg = new Date(conv.last_message_at as string).getTime();
      if (lastMsg <= lastIn) continue;
      if (conv.channel === "whatsapp" && ahora - lastIn > 22 * 3600_000) continue;

      const contacto = conv.contacts as unknown as Contacto | null;
      if (!contacto?.external_id) continue;

      // el último mensaje debe ser EL GRITO (de la IA), sin línea después
      const { data: ultimos } = await supabase
        .from("messages")
        .select("direction, sender_type, content, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const ultimo = ultimos?.[0];
      if (!ultimo || ultimo.direction !== "out" || ultimo.sender_type !== "ai") continue;
      if (!esGrito(String(ultimo.content ?? ""))) continue;

      // Carta premium (Roy 2026-10-07): si es plática de venta y nunca ha
      // escuchado el audio de seguimiento, va la nota de voz REAL de Roy en
      // vez del texto — una sola vez por persona, la segunda se quema.
      const { data: outs } = await supabase
        .from("messages")
        .select("content")
        .eq("conversation_id", conv.id)
        .eq("direction", "out")
        .order("created_at", { ascending: false })
        .limit(50);
      const venta = esPlaticaDeVenta((outs ?? []).map((m) => ({ content: m.content as string | null })));
      const yaAudio = (outs ?? []).some((m) =>
        String(m.content ?? "").startsWith("🎙️ (audio de Roy) seguimiento")
      );
      if (venta && !yaAudio) {
        const { markerAudio: _ignora, enviarAudioPregrabado, AUDIOS_ROY } = await import("@/lib/voz/audios-pregrabados");
        void _ignora;
        const { data: msg } = await supabase
          .from("messages")
          .insert({
            conversation_id: conv.id,
            contact_id: conv.contact_id,
            channel: conv.channel,
            direction: "out",
            sender_type: "ai",
            content: `🎙️ (audio de Roy) ${AUDIOS_ROY.seguimiento}`,
          })
          .select()
          .single();
        if (msg) {
          try {
            const mid = await enviarAudioPregrabado(conv.channel, contacto.external_id, "seguimiento");
            await supabase.from("messages").update({ status: "sent", meta_message_id: mid }).eq("id", msg.id);
            lineas.push(conv.id as string);
            await espera(1500);
            continue;
          } catch (e) {
            console.error("Audio de seguimiento falló; va texto:", conv.id, e);
            await supabase.from("messages").delete().eq("id", msg.id);
          }
        }
      }

      const linea = await lineaInsistida(conv.id);
      if (!linea) continue;
      if (await manda(conv as never, contacto.external_id, linea)) {
        lineas.push(conv.id as string);
      }
      await espera(1500);
    }
  }

  return NextResponse.json({ gritos: gritos.length, lineas: lineas.length, conv_gritos: gritos, conv_lineas: lineas });
}
