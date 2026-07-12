import { createAnthropicClient } from "@/lib/anthropic";

// Extrae el nombre humano de un @usuario de Instagram con IA:
// "eduardonolasco51" -> "Eduardo", "vero.avecilla" -> "Vero",
// "chaos_2120" -> null (no trae nombre — y entonces NO se usa nombre,
// nunca el username crudo: regla de Roy).
// Nunca lanza: si algo falla, se saluda sin nombre.
export async function nombreDesdeUsername(username: string): Promise<string | null> {
  try {
    const anthropic = createAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 10,
      system: `Se te da un username de Instagram. Si contiene claramente un nombre de pila de persona (en español o común en Latinoamérica), responde SOLO ese primer nombre, capitalizado (ej. "eduardonolasco51" -> "Eduardo", "majo_glez" -> "Majo", "dra.paulina.mtz" -> "Paulina"). Si NO contiene un nombre de persona reconocible (ej. "chaos_2120", "mrx_gamer", "tiendaoficial") responde exactamente: NO`,
      messages: [{ role: "user", content: username }],
    });

    const texto = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();

    if (!texto || texto.toUpperCase() === "NO" || texto.length > 20 || /\s/.test(texto)) return null;
    return texto;
  } catch (error) {
    console.error("Error extrayendo nombre del username:", error);
    return null;
  }
}
