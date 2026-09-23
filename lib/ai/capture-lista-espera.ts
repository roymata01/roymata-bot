import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

const HISTORY_LIMIT = 30;

// Señales baratas de interés en el Instituto/Gen 2 — el extractor con IA
// solo corre si hay señal o si esta conversación ya está en la lista (para
// ir completando correo/teléfono que llegan después).
const GEN2_HINT =
  /instituto|generaci[oó]n|inscri|lista de espera|apunta|anota|diciembre|clase gratis|curso en l[ií]nea|cu[aá]ndo abren|c[oó]mo le hago para entrar|quiero entrar|me interesa el curso/i;

interface ListaData {
  quiere_lista: boolean;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  notas: string | null;
}

// Detecta en la conversación a quien quiere entrar al Instituto VITA
// (Generación 2, abre en diciembre) y lo guarda en lista_espera_gen2.
// Nunca lanza: un fallo aquí no debe tumbar la respuesta del bot.
export async function maybeCaptureListaEspera(
  conversationId: string,
  contactId: string,
  channel: string,
  lastMessage: string | null
) {
  try {
    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("lista_espera_gen2")
      .select("id, nombre, correo, telefono")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (!existing && !GEN2_HINT.test(lastMessage ?? "")) return;
    // Ya capturado con correo o teléfono: no hay nada más que completar
    if (existing?.correo || existing?.telefono) return;

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

    const anthropic = createAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 250,
      system: `Analiza esta conversación de redes sociales de Roy Mata (paramédico, cursos de primeros auxilios).

¿La persona mostró interés en INSCRIBIRSE al Instituto VITA / al curso en línea de Roy PARA SÍ MISMA (o aceptó que la apunten a la lista de espera de la Generación 2 que abre en diciembre)? Un curso para su empresa/escuela NO cuenta (eso es cotización).

Responde ÚNICAMENTE con JSON válido, sin texto extra:
{"quiere_lista": true/false, "nombre": "nombre de la persona o null", "correo": "... o null", "telefono": "... o null", "notas": "resumen de 1 línea de su interés o null"}

Solo incluye datos que el CLIENTE haya dicho explícitamente. Si un dato no aparece, usa null.`,
      messages: [{ role: "user", content: transcript }],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const parsed = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "")) as ListaData;
    if (!parsed.quiere_lista && !existing) return;

    const { data: contacto } = await supabase
      .from("contacts")
      .select("display_name")
      .eq("id", contactId)
      .maybeSingle();

    await supabase.from("lista_espera_gen2").upsert(
      {
        conversation_id: conversationId,
        contact_id: contactId,
        channel,
        nombre: parsed.nombre ?? existing?.nombre ?? null,
        usuario: contacto?.display_name ?? null,
        correo: parsed.correo ?? existing?.correo ?? null,
        telefono: parsed.telefono ?? existing?.telefono ?? null,
        notas: parsed.notas ?? null,
        origen: "dm",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" }
    );
  } catch (error) {
    console.error("Error capturando lista de espera Gen 2:", error);
  }
}
