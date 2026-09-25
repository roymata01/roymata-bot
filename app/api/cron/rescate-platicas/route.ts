import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAiReply } from "@/lib/ai/generate-reply";
import { sendForChannel } from "@/lib/meta/send-message";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Rescate one-off (2026-09-25): contesta las pláticas de comentario que el
// bot dejó en visto cuando el clasificador las marcaba "personal". Corre en
// producción porque ahí vive la clave de Anthropic. Procesa hasta `max` por
// llamada; se invoca varias veces hasta que devuelva atendidas: 0.
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const max = Math.min(5, Number(req.nextUrl.searchParams.get("max")) || 3);
  const supabase = createAdminClient();
  const desde = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data: invites } = await supabase
    .from("comment_invites")
    .select("username, conversation_id")
    .not("conversation_id", "is", null)
    .gte("created_at", desde);

  const atendidas: string[] = [];
  for (const inv of invites ?? []) {
    if (atendidas.length >= max) break;
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, ai_enabled, contact_id, channel, contacts(external_id)")
      .eq("id", inv.conversation_id)
      .maybeSingle();
    if (!conv || conv.ai_enabled === false) continue;

    const { data: ultimo } = await supabase
      .from("messages")
      .select("direction")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ultimo || ultimo.direction !== "in") continue;

    const externalId = (conv.contacts as unknown as { external_id: string } | null)?.external_id;
    if (!externalId) continue;

    const { mensajes, replyText } = await generateAiReply(conv.id, conv.channel, conv.contact_id);
    if (!replyText || !mensajes.length) continue;
    for (const [i, m] of mensajes.entries()) {
      try {
        const mid = await sendForChannel(conv.channel, externalId, m.text);
        await supabase.from("messages").update({ status: "sent", meta_message_id: mid }).eq("id", m.messageId);
      } catch (e) {
        console.error("Rescate: fallo enviando a", inv.username, e);
        await supabase.from("messages").update({ status: "failed" }).eq("id", m.messageId);
        break;
      }
      if (i < mensajes.length - 1) await espera(5000);
    }
    atendidas.push(String(inv.username));
    await espera(1500);
  }
  return NextResponse.json({ atendidas: atendidas.length, usuarios: atendidas });
}
