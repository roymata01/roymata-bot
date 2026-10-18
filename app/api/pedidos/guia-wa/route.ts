import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NUMERO_ROY = process.env.ROY_WHATSAPP_ALERTAS || "522228067240";

// Guía de envío lista (Roy 17-oct): cuando cursos.vita genera la guía de un
// pedido en EnvioClick, aquí se le manda a ROY por WhatsApp el PDF adjunto
// con el folio y qué empacar (plantilla guia_pedido_lista, header DOCUMENT).
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { folio, empacar, paqueteria, tracking, guiaUrl } = await req.json().catch(() => ({}));
  if (!guiaUrl) return NextResponse.json({ error: "Falta guiaUrl" }, { status: 400 });

  const limpio = (t: unknown, max: number) =>
    (String(t ?? "—").replace(/\s+/g, " ").trim() || "—").slice(0, max);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: NUMERO_ROY,
        type: "template",
        template: {
          name: "guia_pedido_lista",
          language: { code: "es_MX" },
          components: [
            {
              type: "header",
              parameters: [
                {
                  type: "document",
                  document: { link: String(guiaUrl), filename: `Guia-Pedido-${folio ?? ""}.pdf` },
                },
              ],
            },
            {
              type: "body",
              parameters: [
                { type: "text", text: limpio(folio, 20) },
                { type: "text", text: limpio(empacar, 200) },
                { type: "text", text: limpio(paqueteria, 80) },
                { type: "text", text: limpio(tracking, 60) },
              ],
            },
          ],
        },
      }),
    }
  );
  if (!res.ok) {
    const detalle = await res.text();
    console.error("Guía por WA a Roy falló:", res.status, detalle);
    return NextResponse.json({ error: detalle }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
