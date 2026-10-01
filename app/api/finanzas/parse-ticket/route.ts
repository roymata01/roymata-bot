import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicClient } from "@/lib/anthropic";

export const maxDuration = 30;

// Foto de un ticket → registro de finanzas. Gemela de parse-voz pero con
// visión: extrae total, fecha, establecimiento y categoría (de LAS listas de
// Roy). Nunca inventa montos: sin total claro, amount = null.
//
// Auth por Bearer token (no por cookies): la app de Finanzas también vive
// como PWA independiente en el teléfono de Roy, donde no hay cookies del
// panel — manda el access token de su sesión de Supabase y aquí se valida.
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: auth, error: authError } = await createAdminClient().auth.getUser(token);
  if (authError || !auth?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { image, expCats, incCats } = await req.json();
  const m = String(image ?? "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return NextResponse.json({ error: "Falta la foto del ticket" }, { status: 400 });

  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  const response = await createAnthropicClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: `Foto de un ticket, recibo, factura o pantallazo de pago. Extrae el movimiento de finanzas personales como JSON.

Categorías de GASTO disponibles: ${(expCats ?? []).join(", ")}
Categorías de INGRESO disponibles: ${(incCats ?? []).join(", ")}

Reglas:
- "type": "expense" salvo que claramente sea un ingreso/cobro recibido.
- "amount": el TOTAL pagado. Si el ticket está en dólares, NO lo conviertas: deja el número tal cual y pon "usd": true. Si no se distingue un total claro, null.
- "date": la fecha del ticket en formato YYYY-MM-DD. Si no se ve, null (hoy es ${hoy}).
- "establishment": el comercio/emisor, corto (ej. "OXXO", "Estrella Roja").
- "category": ELIGE la MÁS parecida de la lista correspondiente; si nada encaja usa "Varios" (gasto) u "Otros". Devuelve el texto EXACTO de la lista.
- "concept": descripción corta de la compra (3-6 palabras).

Responde SOLO JSON: {"type":"expense|income","amount":número o null,"usd":true/false,"date":"YYYY-MM-DD" o null,"establishment":"...","category":"...","concept":"..."}`,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg" | "image/png" | "image/webp", data: m[2] } },
          { type: "text", text: "Extrae el movimiento de este ticket." },
        ],
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "No pude leer el ticket" }, { status: 422 });
  }
}
