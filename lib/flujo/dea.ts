import { createAdminClient } from "@/lib/supabase/admin";
import { aplicarOverrides, type OverridesFlujo, type NodoFlujo } from "@/lib/flujo-quiero";
import { FLUJO_DEA } from "@/lib/flujo-dea";
import { personalizarNombre } from "@/lib/flujo/quiero";

// ============================================================
// Runtime del FLUJO DEA (registro de la masterclass de diciembre).
// Los textos salen de lib/flujo-dea.ts + lo que Roy edite en
// /flujo pestaña DEA (tabla bot_flujos, fila id='dea').
// ============================================================

export const TAG_FLUJO_DEA = "flujo-dea";

/** Todos los nodos del flujo DEA, con los textos editados por Roy aplicados. */
export async function nodosFlujoDea(): Promise<Record<string, NodoFlujo>> {
  let overrides: OverridesFlujo = {};
  try {
    const { data } = await createAdminClient()
      .from("bot_flujos").select("data").eq("id", "dea").maybeSingle();
    overrides = ((data?.data as OverridesFlujo) ?? {}) as OverridesFlujo;
  } catch {
    // sin fila u offline: se usan los textos default del código
  }
  const fases = aplicarOverrides(FLUJO_DEA, overrides);
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

/** El comentario de la campaña: "DEA" (con emojis/signos de más, da igual). */
export function esComentarioDea(texto: string | null): boolean {
  if (!texto || texto.length > 40) return false;
  const t = normalizar(texto);
  return /\bdea\b/.test(t);
}

/** Burbujas de un nodo del flujo DEA (separadas por |||), ya personalizadas. */
export async function burbujasDeNodoDea(nodoId: string, nombre: string | null = null): Promise<string[]> {
  const nodos = await nodosFlujoDea();
  const texto = nodos[nodoId]?.texto ?? "";
  return personalizarNombre(texto, nombre)
    .split("|||")
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Playbook que se inyecta al system prompt cuando la persona está en el flujo DEA. */
export async function playbookFlujoDea(): Promise<string> {
  const n = await nodosFlujoDea();
  const frase = (id: string) => (n[id]?.texto ?? "").trim();
  return `
## FLUJO DEA — esta persona comentó DEA en el video de la masterclass de diciembre
Ya le mandamos el link de registro: cursos.vitarescue.com.mx/masterclass. La masterclass es GRATIS, en vivo, el domingo 13 de diciembre a las 7:00 pm (hora CDMX), sobre primeros auxilios en las fiestas decembrinas. Tu ÚNICO trabajo es que quede registrada — nada más. Usa estas frases como guía (adáptalas apenas lo necesario, mismo estilo):

1. Si dice que ya se registró: "${frase("confirmar")}" — y AHÍ TERMINA tu turno. Si después solo agradece o cierra ("va gracias", "ok"), responde únicamente [FIN].
2. Si pregunta cuánto cuesta, de qué va, a qué hora, dónde: contesta con los datos reales (gratis, dom 13-dic 7pm CDMX, en vivo) al estilo de "${frase("dudas")}" — UNA duda a la vez y SIEMPRE de regreso al link de registro.
3. Si dice que no puede ese día: "${frase("repeticion")}". UN solo intento — nunca dos.
4. Si de plano no le interesa: "${frase("puerta-abierta-dea")}" — y se acabó, cero presión: es una clase gratis.
5. El "ya quedaste registrado?" y el recordatorio de lugares limitados ("${frase("recordatorio-lugares")}") NO los mandas tú — los manda el sistema solo, horas después. Pero si la persona sigue dudando en plena plática, SÍ puedes recordarle una vez, casual, que los lugares son limitados — nunca dos veces.

PROHIBIDO en este flujo: vender el Método HÉROE o cualquier curso de paga, mandar links de compra, inventar datos de la clase (fecha, hora, regalos), pedir el correo por chat (el registro lo pide la página), y las preguntas sociales. Si su mensaje es pura plática social, coqueteo o tema ajeno: responde únicamente [FIN]. Si mezcla embudo con social, contesta SOLO lo del embudo.`;
}
