import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

const HISTORY_LIMIT = 30;

// Señales baratas de que el mensaje puede ser una cotización grupal — el
// extractor con IA solo corre si hay señal o si esta conversación ya tiene
// una cotización abierta (para ir completando correo/teléfono que llegan después).
const QUOTE_HINT =
  /cotiza|empresa|escuela|colegio|universidad|instituci[oó]n|grupo|equipo|colaboradores|empleados|alumnos|estudiantes|brigada|capacitar|capacitaci[oó]n|personas|corporativ/i;

interface QuoteData {
  es_cotizacion: boolean;
  nombre: string | null;
  organizacion: string | null;
  num_personas: number | null;
  correo: string | null;
  telefono: string | null;
  curso: string | null;
  ciudad: string | null;
  estado: string | null;
  pais: string | null;
  notas: string | null;
}

// Detecta y extrae solicitudes de cotización grupal de la conversación.
// Nunca lanza: un fallo aquí no debe tumbar la respuesta del bot.
export async function maybeCaptureQuoteRequest(conversationId: string, contactId: string, lastMessage: string | null) {
  try {
    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("quote_requests")
      .select("id, status, nombre, organizacion, num_personas, correo, telefono, notas")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    const yaAbierta = existing?.status === "pendiente";
    if (!yaAbierta && !QUOTE_HINT.test(lastMessage ?? "")) return;

    const { data: history } = await supabase
      .from("messages")
      .select("direction, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    const transcript = (history ?? [])
      .reverse()
      .filter((m) => m.content)
      .map((m) => `${m.direction === "in" ? "CLIENTE" : "BOT"}: ${m.content}`)
      .join("\n");

    // Catálogo activo: si el curso pedido coincide con uno de estos nombres,
    // el cotizador automático puede generar y ENVIAR la cotización solo.
    const { data: catalogo } = await supabase
      .from("cotizador_cursos").select("nombre").eq("activo", true);
    const nombresCatalogo = (catalogo ?? []).map((c) => c.nombre);

    const anthropic = createAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: `Analiza esta conversación de Instagram/Messenger/WhatsApp de Roy Mata (paramédico, cursos de primeros auxilios).

¿El cliente está pidiendo un curso/capacitación PARA UN GRUPO (empresa, escuela, universidad, brigada, equipo, varias personas)? Preguntar por la clase gratis individual o un curso para sí mismo NO cuenta.

Responde ÚNICAMENTE con JSON válido, sin texto extra:
{"es_cotizacion": true/false, "nombre": "nombre completo del cliente o null", "organizacion": "empresa/escuela o null", "num_personas": número o null, "correo": "... o null", "telefono": "... o null", "curso": "cuál curso pide o null", "ciudad": "su ciudad o null", "estado": "su estado o null", "pais": "su país o null", "notas": "resumen de 1 línea o null"}

Para "curso": si lo que pide corresponde a uno de estos cursos del catálogo, usa EXACTAMENTE ese nombre: ${nombresCatalogo.join(" | ") || "Primeros auxilios básicos en adultos"}. Si pide otra cosa, escribe lo que pidió tal cual.
Para "estado": el estado mexicano con su nombre oficial (ej. "Puebla", "Estado de México", "Ciudad de México"). Para "pais": "México" si es de México.
Solo incluye datos que el CLIENTE haya dicho explícitamente. Si un dato no aparece, usa null.`,
      messages: [{ role: "user", content: transcript }],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const parsed = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "")) as QuoteData;
    if (!parsed.es_cotizacion) return;

    // no pisar datos ya capturados con nulls: lo estructurado previo se
    // recupera de las notas viejas (mismo formato que usa el formulario web)
    const prevNotas = existing?.notas ?? "";
    const prev = {
      curso: prevNotas.match(/Curso:\s*([^·]+)/)?.[1]?.trim() || null,
      lugar: prevNotas.match(/Lugar:\s*([^·]+)/)?.[1]?.trim() || null,
    };
    const curso = parsed.curso ?? prev.curso;
    const lugarPartes = [parsed.ciudad, parsed.estado, parsed.pais].filter(Boolean);
    const lugar = lugarPartes.length >= 2 ? lugarPartes.join(", ") : prev.lugar;
    // Notas en el formato del formulario web: así el cotizador automático
    // también puede resolver las solicitudes que llegan por chat.
    const resumen = parsed.notas ?? "";
    const notas =
      [
        "💬 Solicitud desde el chat",
        lugar ? `Lugar: ${lugar}` : null,
        curso ? `Curso: ${curso}` : null,
        "Instructor Roy: no",
        resumen || null,
      ]
        .filter(Boolean)
        .join(" · ") || null;

    const payload = {
      conversation_id: conversationId,
      contact_id: contactId,
      nombre: parsed.nombre ?? existing?.nombre ?? null,
      organizacion: parsed.organizacion ?? existing?.organizacion ?? null,
      num_personas: parsed.num_personas ?? existing?.num_personas ?? null,
      correo: parsed.correo ?? existing?.correo ?? null,
      telefono: parsed.telefono ?? existing?.telefono ?? null,
      notas,
    };

    await supabase.from("quote_requests").upsert(payload, { onConflict: "conversation_id" });
  } catch (error) {
    console.error("Error capturando cotización:", error);
  }
}
