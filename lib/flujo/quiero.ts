import { createAdminClient } from "@/lib/supabase/admin";
import { FLUJO_QUIERO, aplicarOverrides, type OverridesFlujo, type NodoFlujo } from "@/lib/flujo-quiero";

// ============================================================
// Runtime del FLUJO QUIERO (embudo del Método HÉROE).
// Los textos salen de lib/flujo-quiero.ts + lo que Roy editó en
// /flujo (tabla bot_flujos, fila id='quiero') — lo que Roy ve en
// el diagrama ES lo que el bot dice aquí.
// ============================================================

export const TAG_FLUJO_QUIERO = "flujo-quiero";
// Cuenta de prueba de Roy: con el bot pausado, SOLO ella pasa por el flujo.
export const USUARIO_PRUEBA_ROY = "rodrigo.mataa";

/** Todos los nodos del flujo, con los textos editados por Roy aplicados. */
export async function nodosFlujoQuiero(): Promise<Record<string, NodoFlujo>> {
  let overrides: OverridesFlujo = {};
  try {
    const { data } = await createAdminClient()
      .from("bot_flujos").select("data").eq("id", "quiero").maybeSingle();
    overrides = ((data?.data as OverridesFlujo) ?? {}) as OverridesFlujo;
  } catch {
    // sin tabla u offline: se usan los textos default del código
  }
  const fases = aplicarOverrides(FLUJO_QUIERO, overrides);
  const porId: Record<string, NodoFlujo> = {};
  for (const fase of fases) {
    for (const paso of fase.pasos) {
      if (paso.tipo === "nodo") porId[paso.nodo.id] = paso.nodo;
      else for (const rama of paso.ramas) for (const n of rama.nodos) porId[n.id] = n;
    }
  }
  return porId;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zñ0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** El comentario de la campaña: "QUIERO" (con emojis/signos de más, da igual). */
export function esComentarioQuiero(texto: string | null): boolean {
  if (!texto || texto.length > 40) return false;
  const t = normalizar(texto);
  return /\bquiero\b/.test(t) && !/\bno quiero\b/.test(t);
}

/** "si", "va", "claro porfa"... — el sí corto al ofrecimiento del video. */
export function esAfirmacionCorta(texto: string | null): boolean {
  if (!texto || texto.length > 40 || texto.includes("?")) return false;
  const t = normalizar(texto);
  return /^(si+|sii+p?|claro|va+|dale|sale|ok(ey)?|obvio|simon|arre|porfa(vor)?|por favor|de una|andale|yes|mandalo|mandamelo|pasalo|pasamelo|quiero verlo|a huevo)\b/.test(t)
    || /^(si+|claro|va+)\s/.test(t);
}

// Vocabulario de cierre: si TODO el mensaje son palabras de estas (≤6), la
// persona está cerrando la plática — no preguntando ni objetando.
const PALABRAS_CIERRE = new Set([
  "va", "vale", "ok", "okey", "oki", "sale", "dale", "listo", "listoo",
  "gracias", "graciass", "grax", "muchas", "mil", "thanks", "ty",
  "perfecto", "genial", "super", "buenisimo", "excelente", "chido", "padre",
  "de", "nada", "igualmente", "claro", "aja", "sip", "si", "simon",
  "al", "rato", "alrato", "lo", "veo", "checo", "reviso", "luego", "ahorita", "despues",
  "ahi", "te", "aviso", "cuento", "digo", "nos", "vemos", "saludos", "bye", "adios",
  "entendido", "enterado", "ntp", "oks", "tqm", "bendiciones", "igual", "roy",
]);

// Señal FUERTE de cierre: sin una de estas, un "va"/"si"/"ok" suelto se trata
// como afirmación (puede estar contestando una pregunta del bot), no cierre.
const CIERRE_FUERTE =
  /\b(gracias+|grax|thanks|ty|bye|adios|saludos|bendiciones|nos vemos|al rato|alrato|luego lo (veo|checo|reviso)|ahorita lo (veo|checo|reviso)|despues lo (veo|checo|reviso)|ahi te (aviso|digo|cuento)|listo+)\b/;

/**
 * "va gracias", "ok luego lo veo", "listo 🙌" — la persona está CERRANDO.
 * El bot NO debe contestar (regla de Roy 14-oct: "debes saber acabar la
 * conversacion, el bot siempre quiere ser el ultimo mensaje y no").
 */
export function esCierreDePlatica(texto: string | null): boolean {
  if (!texto || texto.length > 60 || texto.includes("?")) return false;
  const t = normalizar(texto);
  const palabras = t.split(" ").filter(Boolean);
  if (palabras.length === 0) return true; // puro emoji = cierre
  if (palabras.length > 6) return false;
  return CIERRE_FUERTE.test(t) && palabras.every((p) => PALABRAS_CIERRE.has(p));
}

/** {nombre} -> nombre real; sin nombre, el marcador se quita limpio. */
export function personalizarNombre(texto: string, nombre: string | null): string {
  if (nombre) return texto.replaceAll("{nombre}", nombre);
  return texto.replace(/\s*\{nombre\}/g, "").replace(/\{nombre\}\s*/g, "");
}

/** Burbujas de un nodo (separadas por |||), ya personalizadas. */
export async function burbujasDeNodo(nodoId: string, nombre: string | null = null): Promise<string[]> {
  const nodos = await nodosFlujoQuiero();
  const texto = nodos[nodoId]?.texto ?? "";
  return personalizarNombre(texto, nombre)
    .split("|||")
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Playbook que se inyecta al system prompt cuando la persona está en el flujo. */
export async function playbookFlujoQuiero(): Promise<string> {
  const n = await nodosFlujoQuiero();
  const frase = (id: string) => (n[id]?.texto ?? "").trim();
  return `
## FLUJO QUIERO — esta persona comentó QUIERO en el video del Método HÉROE
Su interés YA existe (por eso comentó). NO investigues pains ni hagas plática de descubrimiento: tu único trabajo es llevarla por este embudo, en orden, un paso por respuesta. Usa estas frases como guía (adáptalas apenas lo necesario, mismo estilo):

1. Ya se le ofreció el video con la mini clase. Si dice que sí (o algo parecido), tu respuesta ES mandar el video tal cual: "${frase("mandar-video")}". Sin preguntas antes, sin precio.
2. Recién mandado el video, si la persona solo agradece o cierra ("va gracias", "ok"), AHÍ TERMINA tu turno: responde únicamente [FIN]. El "ya pudiste ver el video?" NO lo mandas tú — lo manda el sistema solo, horas después. Tú solo sigues el seguimiento cuando la persona retome la plática: "${frase("que-te-parecio")}" — y cuando fluya: "${frase("cierre")}". UNA pregunta a la vez.
3. Si dice que SÍ le interesa / lo quiere: "${frase("inscripcion")}". El link de compra SOLO en este paso.
4. Si dice que NO PUEDE (dinero, tiempo, lo que sea): "${frase("entender")}". UN solo intento más — nunca dos.
5. Si después de ese intento sigue en no, o de plano dice que no le interesa: "${frase("clase-gratis")}". Aquí el objetivo es que te dé su NOMBRE y su CORREO.
6. Cuando dé sus datos: "${frase("despedida")}".

PROHIBIDO en este flujo: dar el precio por chat (el video lo dice), preguntas sociales, volver a preguntar si quiere el video cuando ya dijo que sí, y mandar el link de compra antes del paso 3. Y si su mensaje es pura plática social, coqueteo o tema ajeno al curso: responde únicamente [FIN] — el bot no platica, solo lleva el embudo. Si mezcla embudo con social, contesta SOLO lo del embudo e ignora lo social por completo.`;
}
