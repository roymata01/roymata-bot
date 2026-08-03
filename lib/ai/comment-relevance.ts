import { createAnthropicClient } from "@/lib/anthropic";

// ¿El comentario tiene que ver con los cursos? Desde el 2026-08-02 este
// filtro aplica TANTO al DM de invitación como a la respuesta pública: en
// posts personales de Roy (logros, felicitaciones, vida diaria) NADIE debe
// recibir un DM de venta por comentar. Nunca lanza: ante error, no se invita.
export async function comentarioRelacionadoConClase(texto: string | null): Promise<boolean> {
  if (!texto || !texto.trim()) return false;
  try {
    const anthropic = createAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 5,
      system: `Roy Mata es paramédico y promociona el Instituto VITA (cursos de primeros auxilios en vivo con certificados). Se te da un comentario de una de sus publicaciones de redes sociales. OJO: Roy también publica contenido personal (logros deportivos, competencias, vida diaria) donde la gente lo felicita — esos comentarios NO son de cursos.

¿El comentario muestra interés en cursos/clases/certificados, pide información de ellos, o pregunta algo de primeros auxilios? Responde SI.
¿Es un comentario casual o personal sin relación con los cursos (felicitaciones, chistes, emojis sueltos, piropos, etiquetar amigos, porras, opiniones del video sin pedir nada)? Responde NO.

Responde ÚNICAMENTE: SI o NO`,
      messages: [{ role: "user", content: texto.slice(0, 500) }],
    });
    const out = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim()
      .toUpperCase();
    return out.startsWith("SI");
  } catch (error) {
    console.error("Error clasificando relevancia del comentario:", error);
    return false;
  }
}
