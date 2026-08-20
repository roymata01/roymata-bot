import { createAnthropicClient } from "@/lib/anthropic";

// Respuestas del modo familiar HYROX.
//
// DECISIÓN DE DISEÑO IMPORTANTE: el texto que sale de aquí NO lo escribe la IA.
// La IA solo clasifica QUÉ está preguntando el familiar; el mensaje se arma con
// plantillas fijas. Es a propósito: cuando el tema es el estado de salud de una
// persona, un modelo generando texto libre puede inventar un dato médico por
// más candado que le pongas en el prompt. Con plantillas eso es imposible.
// El precio es que las respuestas se repiten — y eso justamente es lo que Roy
// pidió: repetir con paciencia la misma dirección.

export type Intencion = "estado" | "ubicacion" | "otra_emergencia" | "no_medico" | "general";

const PREFIJO = "Este es un mensaje automático del Servicio Médico del evento.";
const CIERRE = "— Servicio Médico del evento (mensaje automático)";

function direccion(puesto: string | null): string {
  return puesto
    ? `Acércate a ${puesto} o pregúntale a cualquier miembro del staff del evento o en el Infopoint — ahí te pueden dar más información y guiarte.`
    : `Pregúntale a cualquier miembro del staff del evento o acércate al Infopoint — ahí te pueden dar más información y guiarte.`;
}

export function componerRespuesta(params: {
  intencion: Intencion;
  puesto: string | null;
  esPrimeraRespuesta: boolean;
  insiste: boolean;
}): string {
  const { intencion, puesto, esPrimeraRespuesta, insiste } = params;
  const dir = direccion(puesto);
  let cuerpo: string;

  switch (intencion) {
    case "estado":
      cuerpo = insiste
        ? `Entiendo tu preocupación y quisiera poder darte más datos.\n\nPor este medio no tenemos información sobre su estado — solo el personal que está con él puede dártela.\n\n${dir}`
        : `Por este medio no tenemos información sobre su estado. Lo único que podemos confirmarte es que está siendo atendido por nuestro personal médico.\n\n${dir}`;
      break;

    case "ubicacion":
      cuerpo = puesto
        ? `Lo está atendiendo nuestro personal médico en ${puesto}.\n\nAcércate ahí o pregúntale a cualquier miembro del staff del evento o en el Infopoint — te guían hasta el lugar.`
        : `Por este medio no tenemos el dato exacto del lugar.\n\n${dir}`;
      break;

    case "otra_emergencia":
      cuerpo = `Si alguien necesita atención médica en este momento, acércate al puesto médico más cercano o pídele ayuda a cualquier miembro del staff del evento — ellos activan al equipo médico de inmediato.\n\nSi estás buscando a tu familiar, en el Infopoint te pueden orientar.`;
      break;

    case "no_medico":
      cuerpo = `Por este medio solo podemos ayudarte con el servicio médico del evento.\n\n${dir}`;
      break;

    default:
      cuerpo = insiste
        ? `Entiendo tu preocupación. Tu familiar está siendo atendido por nuestro personal médico.\n\n${dir}`
        : `Tu familiar está siendo atendido por nuestro personal médico.\n\n${dir}`;
  }

  return esPrimeraRespuesta ? `${PREFIJO}\n\n${cuerpo}` : `${cuerpo}\n\n${CIERRE}`;
}

async function clasificarIntencion(texto: string): Promise<Intencion> {
  try {
    const anthropic = createAnthropicClient();
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8,
      system: `Un familiar de una persona atendida en el evento HYROX escribe por WhatsApp. Clasifica QUÉ está pidiendo, en una palabra:

- ESTADO: pregunta cómo está, qué tiene, qué le pasó, si es grave, si está bien, si va a estar bien.
- UBICACION: pregunta dónde está, en qué clínica o carpa, cómo llegar, si puede verlo.
- OTRA_EMERGENCIA: alguien MÁS se siente mal ahora, o no encuentra a su familiar, o pide ayuda médica para otra persona.
- NO_MEDICO: pregunta por cursos, precios, contenido o cualquier tema ajeno al evento.
- GENERAL: saluda, agradece, avisa que va en camino, o cualquier otra cosa.

Responde ÚNICAMENTE con una palabra.`,
      messages: [{ role: "user", content: texto }],
    });
    const salida = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim()
      .toUpperCase();
    if (salida.startsWith("ESTADO")) return "estado";
    if (salida.startsWith("UBICA")) return "ubicacion";
    if (salida.startsWith("OTRA")) return "otra_emergencia";
    if (salida.startsWith("NO_MED") || salida.startsWith("NOMED")) return "no_medico";
    return "general";
  } catch (error) {
    // Si falla la clasificación, la plantilla general sirve para cualquier caso.
    console.error("HYROX: falló la clasificación de intención, se usa general:", error);
    return "general";
  }
}

export async function generarRespuestaFamiliar(params: {
  texto: string | null;
  puesto: string | null;
  esPrimeraRespuesta: boolean;
  respuestasPrevias: number;
}): Promise<{ texto: string; intencion: Intencion }> {
  const intencion = params.texto ? await clasificarIntencion(params.texto) : "general";
  const texto = componerRespuesta({
    intencion,
    puesto: params.puesto,
    esPrimeraRespuesta: params.esPrimeraRespuesta,
    insiste: params.respuestasPrevias >= 2,
  });
  return { texto, intencion };
}
