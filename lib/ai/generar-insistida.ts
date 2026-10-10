import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { humanizarTexto } from "@/lib/ai/humanizar-texto";

// Insistida humana en dos tiempos (pedido de Roy 2026-10-07): cuando alguien
// deja al bot en visto ~5 horas, primero se manda SOLO su nombre alargado como
// de grito ("Brendaaa"). Se esperan ~2 horas a ver si contesta; si sigue el
// silencio, entonces va la línea — retome normal, o presión de venta si ya se
// le mandó link de compra (ayuda / recalentar con SU caso / garantía 7 días).

/** "Brenda López" -> "Brendaaa" (estira la última vocal 2 o 3 letras al azar,
 *  para que no se vea siempre igual). En plática de venta lleva "jaja" al
 *  final para suavizar la presión. Sin nombre usable -> "heey". */
export function gritoNombre(nombre: string | null | undefined, conJaja = false): string {
  const primer = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const limpio = primer.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let grito: string;
  if (!/^[a-zñ]{2,15}$/.test(limpio)) {
    grito = "heey";
  } else {
    let idx = -1;
    for (const v of "aeiou") idx = Math.max(idx, limpio.lastIndexOf(v));
    const extra = 1 + Math.floor(Math.random() * 2); // 1 o 2 letras extra (total 2-3 iguales)
    const alargado =
      idx < 0 ? limpio + "eee" : limpio.slice(0, idx + 1) + limpio[idx].repeat(extra) + limpio.slice(idx + 1);
    grito = alargado[0].toUpperCase() + alargado.slice(1);
  }
  return conJaja ? `${grito} jaja` : grito;
}

/** ¿Un mensaje saliente es un grito de insistida? (para la fase 2 del cron) */
export function esGrito(texto: string): boolean {
  const t = (texto ?? "").trim();
  return t.length <= 25 && /^[A-Za-zñÑ]*([aeiou])\1{1,3}[a-zñ]*( jaja)?$/.test(t);
}

/** ¿La plática ya es de venta? (el bot ya mandó un link de compra/acceso) */
export function esPlaticaDeVenta(salientes: { content: string | null }[]): boolean {
  return salientes.some(
    (m) => m.content && /https?:\/\//.test(m.content) && /(curso|inscri|acceso|compra)/i.test(m.content)
  );
}

async function historiaDe(conversationId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data: historia } = await supabase
    .from("messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);
  return (historia ?? [])
    .reverse()
    .filter((m) => m.content)
    .map((m) => `${m.direction === "in" ? "Cliente" : "Roy"}: ${m.content}`)
    .join("\n");
}

/** Si el contacto no tiene nombre usable (@catitos12), busca si lo dijo en la
 *  plática y lo guarda en contacts.display_name. Devuelve el nombre o null. */
export async function capturarNombreDeLaPlatica(
  conversationId: string,
  contactId: string
): Promise<string | null> {
  const chat = await historiaDe(conversationId);
  if (!chat) return null;
  try {
    const anthropic = createAnthropicClient();
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 10,
      system: `Lee la plática. Si el CLIENTE dijo su propio nombre en algún momento ("soy caro", "me llamo luis", "mi nombre es..."), responde SOLO ese primer nombre capitalizado. Si nunca lo dijo, responde exactamente: NO`,
      messages: [{ role: "user", content: chat }],
    });
    const texto = r.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    if (!texto || texto.toUpperCase() === "NO" || texto.length > 20 || /\s/.test(texto)) return null;
    const supabase = createAdminClient();
    await supabase.from("contacts").update({ display_name: texto }).eq("id", contactId);
    return texto;
  } catch (e) {
    console.error("capturarNombreDeLaPlatica:", e);
    return null;
  }
}

/** La línea que sigue al grito (2 h después, si no contestó). Analiza TODA la
 *  plática: si ya se mandó link de compra y no han comprado → presión de venta
 *  personalizada; si no → retome normal. */
export async function lineaInsistida(conversationId: string): Promise<string | null> {
  const chat = await historiaDe(conversationId);
  if (!chat) return null;

  const anthropic = createAnthropicClient();
  const r = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 80,
    system: `Eres Roy Mata insistiendo por chat a alguien que lo dejó en visto. Hace un par de horas ya le mandaste su nombre como grito ("Brendaaa") y tampoco contestó; ahora escribe SOLO el siguiente mensaje.

REGLA NÚMERO UNO (Roy 10-oct): la insistida va AL GRANO. PROHIBIDO hacer preguntas de plática o descubrimiento ("a que te dedicas", "como estas", "y tu familia") — la plática ya pasó; ahora el ÚNICO objetivo es que VEA EL VIDEO de Roy (la mini clase). Si la plática ya reveló su pain (su bebé, sus papás, un susto), úsalo como gancho en la misma línea, pero NO preguntes cosas nuevas.

Elige según la plática:
A) Si Roy YA le mandó el link del video (cursos.vitarescue.com.mx/heroe): "oye ya pudiste ver el video? dime que te parecio" (+ su pain si aplica: "por lo de tu bebe en serio no te lo saltes").
B) En CUALQUIER otro caso de interés en primeros auxilios (aunque la plática haya sido larga o casual): manda directo al video con el link: "oye, te dejo el video que te prepare, es una mini clase de como reaccionar ante una emergencia en tu casa: https://cursos.vitarescue.com.mx/heroe" (ajusta el gancho a su pain).
C) SOLO si ya dijo que quiere comprar o pidió dónde pagar y se detuvo: "veo que no te inscribiste, si necesitas ayuda avisame" o "acuerdate que tienes 7 dias de garantia, si no te sientes mas seguro te regreso tu dinero".
D) SOLO si la plática es de soporte de un alumno ya inscrito (constancias, acceso, ayuda técnica): una línea cortita retomando ese pendiente.

Reglas duras: máximo 20 palabras (el link no cuenta), SIN preguntas que no sean sobre el video, todo en minusculas, sin acentos, sin signos de apertura (¿ ¡), cero saludos, sin apodos, tono mexicano relajado, NUNCA menciones precios. Responde SOLO con la línea, nada más.`,
    messages: [{ role: "user", content: `La plática:\n${chat}` }],
  });
  const linea = r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join(" ")
    .trim()
    .replace(/^["']|["']$/g, "");
  return humanizarTexto(linea && linea.length <= 140 ? linea : "ya viste mi mensaje?");
}
