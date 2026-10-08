import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { humanizarTexto } from "@/lib/ai/humanizar-texto";

// Insistida humana (pedido de Roy 2026-10-07): cuando alguien deja al bot en
// visto ~5 horas, se le insiste con DOS mensajes como lo haría Roy desde su
// cel: primero su nombre alargado como de grito ("Brendaaa") y luego una sola
// línea retomando lo que quedó pendiente.

/** "Brenda López" -> "Brendaaa" · "Roy" -> "Roooy" · sin nombre -> "heey" */
export function gritoNombre(nombre: string | null | undefined): string {
  const primer = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const limpio = primer.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!/^[a-zñ]{2,15}$/.test(limpio)) return "heey";
  let idx = -1;
  for (const v of "aeiou") idx = Math.max(idx, limpio.lastIndexOf(v));
  const alargado = idx < 0 ? limpio + "eee" : limpio.slice(0, idx + 1) + limpio[idx].repeat(2) + limpio.slice(idx + 1);
  return alargado[0].toUpperCase() + alargado.slice(1);
}

/** La línea que va después del grito: retoma lo pendiente, estilo Roy.
 *  Analiza TODA la plática reciente (pedido de Roy 2026-10-07): si ya se
 *  mandó el link de compra del curso y no han comprado, la insistida pasa a
 *  modo presión — ayuda con la inscripción, recalentar con SU caso concreto,
 *  o la carta de la garantía de 7 días. */
export async function lineaInsistida(conversationId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: historia } = await supabase
    .from("messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(25);
  const chat = (historia ?? [])
    .reverse()
    .filter((m) => m.content)
    .map((m) => `${m.direction === "in" ? "Cliente" : "Roy"}: ${m.content}`)
    .join("\n");
  if (!chat) return null;

  const anthropic = createAnthropicClient();
  const r = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 80,
    system: `Eres Roy Mata insistiendo por chat a alguien que lo dejó en visto hace horas. Ya le mandaste su nombre como grito ("Brendaaa"), ahora escribe SOLO el segundo mensaje. Analiza TODA la plática antes de escribir.

CASO A — si en la plática Roy ya mandó un LINK DE COMPRA o de inscripción y el cliente no confirmó haber comprado: es seguimiento de venta. Elige UNA carta (la que no se haya usado ya en la plática):
- ayuda: "veo que no adquiriste el curso, si necesitas ayuda en la inscripcion avisame"
- recalentar con SU caso concreto (el miedo o situación que el cliente contó): "en serio que para lo de tu bebe te va a caer perfecto, no te vas a arrepentir"
- garantia: "acuerdate que tienes 7 dias de garantia, si no sientes que ya sabrias reaccionar te regreso tu dinero"
Máximo 18 palabras, personalizada con lo que el cliente contó.

CASO B — cualquier otra plática: UNA línea cortita (máximo 10 palabras) retomando lo pendiente o preguntando si vio tu mensaje. Ejemplos: "entonces q, te late el curso?" · "ya viste mi mensaje?" · "quedamos en algo o q jaja".

Reglas duras para ambos casos: todo en minusculas, sin acentos, sin signos de apertura (¿ ¡), cero saludos (ya saludaste con el grito), sin apodos como bro o amigo, tono mexicano relajado. Responde SOLO con la línea, nada más.`,
    messages: [{ role: "user", content: `La plática:\n${chat}` }],
  });
  const linea = r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join(" ")
    .trim()
    .replace(/^["']|["']$/g, "");
  return humanizarTexto(linea && linea.length <= 120 ? linea : "ya viste mi mensaje?");
}
