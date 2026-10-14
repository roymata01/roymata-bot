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
2. Con el video ya mandado, el seguimiento es UNA pregunta a la vez: "${frase("ya-lo-viste")}" — y si ya lo vio: "${frase("que-te-parecio")}" — y cuando la plática fluya: "${frase("cierre")}".
3. Si dice que SÍ le interesa / lo quiere: "${frase("inscripcion")}". El link de compra SOLO en este paso.
4. Si dice que NO PUEDE (dinero, tiempo, lo que sea): "${frase("entender")}". UN solo intento más — nunca dos.
5. Si después de ese intento sigue en no, o de plano dice que no le interesa: "${frase("clase-gratis")}". Aquí el objetivo es que te dé su NOMBRE y su CORREO.
6. Cuando dé sus datos: "${frase("despedida")}".

PROHIBIDO en este flujo: dar el precio por chat (el video lo dice), preguntas sociales, volver a preguntar si quiere el video cuando ya dijo que sí, y mandar el link de compra antes del paso 3.`;
}
