import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicClient } from "@/lib/anthropic";
import { buscarAlertaHyrox, type AlertaEncontrada } from "@/lib/hyrox/buscar-alerta";
import { FIRMA_ALERTA, FIRMA_RESPUESTA, detectarPuesto, modoEventoEstricto } from "@/lib/hyrox/config";

export type Deteccion = {
  esFamiliar: boolean;
  /** Puesto médico donde está el familiar, si se pudo recuperar. Nunca se inventa. */
  puesto: string | null;
  /** Por qué se decidió así — queda en los logs para poder auditar el evento. */
  motivo: string;
  /** true si ya le habíamos contestado antes en modo familiar. */
  yaContestado: boolean;
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Señales que por sí solas bastan: nadie escribe esto por casualidad.
const FUERTES = [
  "hyrox",
  "servicio medico",
  "clinica 1",
  "clinica 2",
  "carpa 1",
  "carpa medica",
  "infopoint",
  "competidor",
  "dorsal",
  "me llego un mensaje",
  "me llego este mensaje",
  "recibi un mensaje",
  "me mandaron un mensaje",
  "me acaba de llegar un mensaje",
  "esta siendo atendido",
  "esta siendo atendida",
  "lo estan atendiendo",
  "la estan atendiendo",
  "equipo medico",
  "personal medico",
];

// Débiles: cuentan solo si se juntan con otra débil de la otra lista.
const PARENTESCO = [
  "mi hijo", "mi hija", "mi esposo", "mi esposa", "mi mama", "mi madre", "mi papa", "mi padre",
  "mi hermano", "mi hermana", "mi novio", "mi novia", "mi pareja", "mi sobrino", "mi sobrina",
  "mi nieto", "mi nieta", "mi familiar", "mi primo", "mi prima", "mi tio", "mi tia",
  "mi amigo", "mi amiga", "mi cuñado", "mi cuñada", "mi yerno", "mi nuera",
];

const ESTADO = [
  "como esta", "como sigue", "esta bien", "se encuentra bien", "que tiene", "que le paso",
  "es grave", "esta grave", "esta delicado", "se desmayo", "se sintio mal", "se puso mal",
  "ambulancia", "hospital", "urgencias", "lo llevaron", "la llevaron", "donde esta",
  "sigue ahi", "puedo verlo", "puedo verla", "quiero verlo", "quiero verla", "atendido", "atendida",
];

function contiene(texto: string, lista: readonly string[]): string | null {
  return lista.find((k) => texto.includes(k)) ?? null;
}

// Desempate con IA. La instrucción es asimétrica a propósito: solo dice
// SEGUIDOR cuando el mensaje es CLARAMENTE de negocio. Cualquier otra cosa cae
// del lado del familiar, porque venderle un curso a alguien angustiado cuesta
// mucho más que contestarle sobrio a un seguidor.
async function desempatarConIa(texto: string): Promise<boolean> {
  try {
    const anthropic = createAnthropicClient();
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 5,
      system: `Estás filtrando mensajes de WhatsApp que llegan a un número durante el evento HYROX Acapulco 2026.

Ese número le manda alertas médicas a los FAMILIARES de personas atendidas en el evento, y también lo usa un creador de contenido que vende cursos de primeros auxilios.

Clasifica el mensaje en UNA palabra:
- SEGUIDOR: el mensaje es CLARA e INEQUÍVOCAMENTE sobre cursos, precios, certificados, inscripciones, contenido, colaboraciones o negocio. No menciona a ninguna persona atendida ni pregunta por el estado de nadie.
- FAMILIAR: todo lo demás. Cualquier mensaje que pregunte por una persona, por su estado, por dónde está, que suene preocupado, que haga referencia a un mensaje recibido, o que simplemente sea ambiguo.

Ante la más mínima duda responde FAMILIAR.

Responde ÚNICAMENTE con una palabra: SEGUIDOR o FAMILIAR.`,
      messages: [{ role: "user", content: texto }],
    });
    const salida = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim()
      .toUpperCase();
    return !salida.startsWith("SEGUIDOR");
  } catch (error) {
    // Si la IA falla durante el evento, el lado seguro es tratarlo como familiar.
    console.error("HYROX: falló el desempate con IA, se asume familiar:", error);
    return true;
  }
}

async function cargarSalientes(conversationId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("messages")
    .select("content")
    .eq("conversation_id", conversationId)
    .eq("direction", "out")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((m) => (m.content as string) ?? "").filter(Boolean);
}

export async function detectarFamiliarHyrox(params: {
  texto: string | null;
  telefono: string;
  conversationId?: string | null;
  /** Inyectables para pruebas; en producción se cargan solos. */
  salientes?: string[];
  buscarAlerta?: (telefono: string) => Promise<AlertaEncontrada | null>;
}): Promise<Deteccion> {
  const { texto, telefono, conversationId } = params;
  const salientes = params.salientes ?? (conversationId ? await cargarSalientes(conversationId) : []);
  const buscar = params.buscarAlerta ?? buscarAlertaHyrox;

  // 0) Pegajoso: si ya le contestamos en modo familiar, seguimos en modo familiar.
  const respuestaPrevia = salientes.find((c) => c.includes(FIRMA_RESPUESTA));
  if (respuestaPrevia) {
    return {
      esFamiliar: true,
      puesto: detectarPuesto(salientes.join("\n")) ?? detectarPuesto(texto),
      motivo: "ya se le había contestado en modo familiar",
      yaContestado: true,
    };
  }

  // 1) La alerta salió por este mismo hilo (por si algún día se registra aquí).
  const alertaEnHilo = salientes.find((c) => c.includes(FIRMA_ALERTA));
  if (alertaEnHilo) {
    return {
      esFamiliar: true,
      puesto: detectarPuesto(alertaEnHilo) ?? detectarPuesto(texto),
      motivo: "la alerta del evento está en el historial de la conversación",
      yaContestado: false,
    };
  }

  // 2) La alerta salió desde la app de VITA RESCUE (caso normal).
  const alerta = await buscar(telefono);
  if (alerta) {
    return {
      esFamiliar: true,
      puesto: alerta.puesto ?? detectarPuesto(texto),
      motivo: `se le envió una alerta del evento (${alerta.tipo ?? "sin tipo"})`,
      yaContestado: false,
    };
  }

  const limpio = texto ? normalizar(texto) : "";
  if (!limpio) {
    return { esFamiliar: false, puesto: null, motivo: "mensaje vacío", yaContestado: false };
  }

  // 3) Palabra clave inequívoca.
  const fuerte = contiene(limpio, FUERTES);
  if (fuerte) {
    return {
      esFamiliar: true,
      puesto: detectarPuesto(texto),
      motivo: `palabra clave del evento: "${fuerte}"`,
      yaContestado: false,
    };
  }

  // 4) Parentesco + estado juntos ("mi hijo... ¿cómo está?").
  const parentesco = contiene(limpio, PARENTESCO);
  const estado = contiene(limpio, ESTADO);
  if (parentesco && estado) {
    return {
      esFamiliar: true,
      puesto: detectarPuesto(texto),
      motivo: `pregunta por un familiar y su estado ("${parentesco}" + "${estado}")`,
      yaContestado: false,
    };
  }

  // 5) Una sola señal débil (o modo estricto): lo decide la IA, sesgada a familiar.
  if (parentesco || estado || modoEventoEstricto()) {
    const esFamiliar = await desempatarConIa(texto!);
    return {
      esFamiliar,
      puesto: esFamiliar ? detectarPuesto(texto) : null,
      motivo: esFamiliar ? "señal ambigua, la IA lo resolvió como familiar" : "señal ambigua, la IA lo resolvió como seguidor",
      yaContestado: false,
    };
  }

  return { esFamiliar: false, puesto: null, motivo: "sin señales del evento", yaContestado: false };
}
