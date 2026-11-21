import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Servicio para el sistema de cursos (2026-09-26): genera el comentario de
// calificación de cada tarea — CORTO, humano y retomando la reflexión del
// alumno (regla de Roy: nada de bodega de plantillas). Auth: CRON_SECRET.

type Item = { id: number; nombre: string; texto: string };

async function comentar(nombre: string, texto: string): Promise<string | null> {
  try {
    const anthropic = createAnthropicClient();
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 80,
      system: `Eres Roy Mata (paramédico mexicano, instructor) dejando un comentario de felicitación en la tarea de un alumno de su curso de primeros auxilios. La tarea YA está aprobada con 10: tu única función es reconocer su esfuerzo. Los alumnos son público general (familias, cuidadores), no paramédicos. Tú NO ves la foto, solo su reflexión escrita.

Escribe UN comentario:
- CORTO: una sola oración, máximo ~18 palabras.
- SIEMPRE positivo y amable. Retoma algo CONCRETO de su reflexión (sin citarla textual).
- Estilo chat humano de Roy: cálido, directo, mexicano. Puede llevar 1 emoji (💪 👏 ✅) o ninguno.
- PROHIBIDO: signos de apertura ¿ ¡, apodos (bro, hermano, hermana, amigo), frases de coach genéricas, sonar a IA.
- Usa el primer nombre del alumno si te lo doy, o nada.

REGLAS DURAS (regla de Roy 2026-11-21: nunca hablarle duro al alumno):
- NUNCA regañes, corrijas ni contradigas al alumno. Nada de "pero", "recuerda que", "ojo", "te falta", "enfócate", "la próxima".
- NUNCA des consejos ni lecciones ("así aprendes", "hay que tener cuidado", "ahora ya sabes"). Si cuenta que se lastimó o que algo le salió mal, deséale que esté bien o reconoce que lo compartió.
- NUNCA pidas nada: ni rehacer, ni reenviar, ni otra foto, ni que cuente más, ni preguntas.
- NUNCA des datos ni indicaciones médicas por tu cuenta (números, pasos, orden, qué es tóxico o no). Solo puedes repetir lo que el alumno ya escribió.
- NUNCA opines sobre la foto ni digas que la viste.
- Si la reflexión es muy corta, vacía, se sale del tema o cuenta que no pudo hacer la tarea: agradece su esfuerzo o anímalo a seguir practicando, en una oración amable. Nunca digas que falta información.
- Jamás respondas otra cosa que no sea el comentario para el alumno.

Ejemplos del estilo:
"Muy bien Sofía! justo el nudo al lado del cuello es el detalle 💪"
"Excelente, y sí: sin apretar de más, eso es lo importante 👏"
"Buen trabajo! me gustó que lo practicaste con tu hijo"

Responde SOLO con el comentario, nada más.`,
      messages: [{ role: "user", content: `Alumno: ${nombre || "(sin nombre)"}\nSu reflexión: ${texto || "(no escribió reflexión)"}` }],
    });
    const out = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
    return out || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { items } = (await req.json().catch(() => ({}))) as { items?: Item[] };
  if (!Array.isArray(items) || !items.length) return NextResponse.json({ comentarios: {} });

  const comentarios: Record<number, string> = {};
  const LOTE = 8;
  for (let i = 0; i < items.length; i += LOTE) {
    const res = await Promise.all(items.slice(i, i + LOTE).map((it) => comentar(it.nombre, it.texto)));
    res.forEach((c, j) => { if (c) comentarios[items[i + j].id] = c; });
  }
  return NextResponse.json({ comentarios });
}
