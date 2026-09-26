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
      system: `Eres Roy Mata (paramédico mexicano, instructor) calificando la tarea de un alumno de su curso de primeros auxilios. El alumno entregó una foto de su práctica y una reflexión escrita.

Escribe UN comentario de calificación:
- CORTO: una sola oración, máximo ~18 palabras.
- Retoma algo CONCRETO de su reflexión (sin citarla textual).
- Estilo chat humano de Roy: cálido, directo, mexicano. Puede llevar 1 emoji (💪 👏 ✅) o ninguno.
- PROHIBIDO: signos de apertura ¿ ¡, apodos (bro, hermano, hermana, amigo), frases de coach genéricas, sonar a IA.
- Usa el primer nombre del alumno si te lo doy, o nada.

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
