import { createAnthropicClient } from "@/lib/anthropic";

// ¿El comentario tiene que ver con la clase/curso? (regla de Roy: el DM de
// invitación va para todos, pero la respuesta PÚBLICA "te mandé la info por DM"
// solo cuando el comentario lo amerita — en un "😂" o un piropo se ve raro).
// Nunca lanza: en caso de error, mejor no responder en público.
export async function comentarioRelacionadoConClase(texto: string | null): Promise<boolean> {
  if (!texto || !texto.trim()) return false;
  try {
    const anthropic = createAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 5,
      system: `Roy Mata es paramédico y promociona una clase gratis de primeros auxilios (control de hemorragias). Se te da un comentario de una de sus publicaciones.

¿El comentario muestra interés en la clase/curso/tema, pide información, o pregunta algo de primeros auxilios? Responde SI.
¿Es un comentario casual sin relación (chistes, emojis sueltos, piropos, etiquetar amigos, opiniones del video sin pedir nada)? Responde NO.

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
