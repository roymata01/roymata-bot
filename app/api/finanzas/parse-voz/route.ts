import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/anthropic";

export const maxDuration = 30;

// Interpreta lo que Roy dicta ("gasté 200 de gasolina en la Pemex") y lo
// convierte en un registro de finanzas, eligiendo la categoría más parecida
// de SUS listas. Nunca inventa montos: si no hay número claro, amount = null.
export async function POST(req: NextRequest) {
  const supabaseAuth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { transcript, expCats, incCats } = await req.json();
  if (!transcript) return NextResponse.json({ error: "Falta el dictado" }, { status: 400 });

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    system: `Roy dicta por voz un movimiento de sus finanzas personales. Conviértelo en JSON.

Categorías de GASTO disponibles: ${(expCats ?? []).join(", ")}
Categorías de INGRESO disponibles: ${(incCats ?? []).join(", ")}

Reglas:
- "type": "expense" si es un gasto/compra/pago; "income" si es un ingreso/cobro/entrada de dinero. Por defecto expense.
- "amount": el número en pesos (convierte palabras a número: "doscientos" = 200, "mil quinientos" = 1500). Si no hay monto claro, null.
- "category": ELIGE la categoría MÁS parecida de la lista correspondiente (gasto o ingreso). Si nada encaja, usa "Otros" (o "Varios" para gasto). Devuelve el texto EXACTO de la lista.
- "concept": una descripción corta de lo que dijo (3-6 palabras).

Responde SOLO JSON: {"type":"expense|income","amount":número o null,"category":"...","concept":"..."}`,
    messages: [{ role: "user", content: String(transcript).slice(0, 500) }],
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
    return NextResponse.json({ error: "No entendí el dictado" }, { status: 422 });
  }
}
