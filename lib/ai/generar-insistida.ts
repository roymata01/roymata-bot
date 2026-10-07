import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

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

/** La línea que va después del grito: retoma lo pendiente, estilo Roy. */
export async function lineaInsistida(conversationId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: historia } = await supabase
    .from("messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(8);
  const chat = (historia ?? [])
    .reverse()
    .filter((m) => m.content)
    .map((m) => `${m.direction === "in" ? "Cliente" : "Roy"}: ${m.content}`)
    .join("\n");
  if (!chat) return null;

  const anthropic = createAnthropicClient();
  const r = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 60,
    system: `Eres Roy Mata insistiendo por chat a alguien que lo dejó en visto hace horas. Ya le mandaste su nombre como grito ("Brendaaa"), ahora escribe SOLO el segundo mensaje: UNA línea cortita (máximo 10 palabras) retomando lo que quedó pendiente de la plática o preguntando si vio tu mensaje.
Reglas duras: todo en minusculas, sin acentos, sin signos de apertura (¿ ¡), cero saludos (ya saludaste con el grito), sin apodos como bro o amigo, tono mexicano relajado. Ejemplos del estilo: "entonces q, te late el curso?" · "ya viste mi mensaje?" · "quedamos en algo o q jaja" · "no me dejes en visto jaja". Responde SOLO con la línea, nada más.`,
    messages: [{ role: "user", content: `La plática:\n${chat}` }],
  });
  const linea = r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join(" ")
    .trim()
    .replace(/^["']|["']$/g, "");
  return linea && linea.length <= 120 ? linea : "ya viste mi mensaje?";
}
