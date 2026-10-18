import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/anthropic";
import { igToken } from "@/lib/meta/ig-token";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// MINERO DE COMENTARIOS (Roy 17-oct): cada tarde lee los comentarios de las
// últimas 24 h en los posts recientes de IG, detecta las preguntas/temas más
// repetidos y le manda a Roy ideas de contenido servidas. Detalle en el log.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const token = await igToken();
  const corte = Date.now() - 24 * 3600_000;
  const media = (await fetch(
    `https://graph.instagram.com/v23.0/me/media?fields=id,caption,timestamp&limit=8&access_token=${token}`
  ).then((r) => r.json())) as { data?: { id: string; caption?: string }[] };

  const comentarios: string[] = [];
  for (const m of media.data ?? []) {
    const coms = (await fetch(
      `https://graph.instagram.com/v23.0/${m.id}/comments?fields=text,timestamp&limit=100&access_token=${token}`
    ).then((r) => r.json())) as { data?: { text?: string; timestamp: string }[] };
    for (const c of coms.data ?? []) {
      if (new Date(c.timestamp).getTime() < corte) continue;
      const t = (c.text ?? "").trim();
      if (t.length > 3 && !/^quiero\W*$/i.test(t)) comentarios.push(t.slice(0, 180));
    }
    if (comentarios.length > 400) break;
  }
  if (comentarios.length < 10) return NextResponse.json({ pocos: comentarios.length });

  const anthropic = createAnthropicClient();
  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: `Eres el analista de contenido de Roy Mata, paramédico creador de contenido de primeros auxilios (6M seguidores). Te paso los comentarios de las últimas 24 h de sus posts de Instagram.

Devuelve EXACTAMENTE este formato, breve y accionable:
PREGUNTAS REPETIDAS: las 3-5 dudas o temas que más se repiten (una línea cada una, con cuántas veces aprox).
IDEAS DE VIDEO: 3 ideas concretas de video que nacen de esos comentarios (título gancho de una línea cada una).
Sin introducciones ni despedidas.`,
    messages: [{ role: "user", content: comentarios.join("\n") }],
  });
  const analisis = resp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();

  const resumenWa = `Minero de comentarios (${comentarios.length} analizados): ${analisis}`.slice(0, 880);
  await fetch(`${req.nextUrl.origin}/api/avisos/roy-wa`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "minero-comentarios", texto: resumenWa, detalle: analisis }),
  });
  return NextResponse.json({ ok: true, comentarios: comentarios.length });
}
