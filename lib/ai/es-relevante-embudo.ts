import { createAnthropicClient } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

// "Solo lo importante" (Roy 14-oct): en las pláticas que abrió el bot
// (comment-DM / flujo QUIERO), un mensaje clasificado como "personal" ya NO
// pasa en automático — este filtro decide si trae algo del embudo (pains,
// dudas, objeciones, datos) o si es plática social que debe quedarse sin
// respuesta para que la conteste Roy en persona.
//
// Falla hacia el SILENCIO: ante error, el bot se calla (preferencia explícita
// de Roy — "no se trata de que el bot se ponga a contestarles todo").
export async function esRelevanteAlEmbudo(
  conversationId: string,
  lastMessage: string | null
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data: history } = await supabase
      .from("messages")
      .select("direction, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(12);

    const transcript = (history ?? [])
      .reverse()
      .filter((m) => m.content)
      .map((m) => `${m.direction === "in" ? "CLIENTE" : "BOT"}: ${m.content}`)
      .join("\n");

    const anthropic = createAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 10,
      system: `Eres el filtro del bot de Roy Mata (paramédico que vende un curso de primeros auxilios por chat).

Decide si el ÚLTIMO mensaje del cliente amerita respuesta del BOT dentro del embudo de venta, o si es plática que debe contestar Roy en persona (o nadie).

EMBUDO (el bot sí contesta): interés en aprender primeros auxilios, dudas del curso/certificados/manuales/inscripción/pago, miedos o historias de emergencias o accidentes (propias o de su familia), objeciones de compra (caro, no tengo tiempo), dar sus datos (nombre/correo/teléfono), responder algo que el bot le preguntó, pedir el video o decir que ya lo vio.

SOCIAL (el bot se calla): saludos sueltos en plática ya avanzada, coqueteo, chistes o memes, opiniones de otros temas (deportes, viajes, su vida social), preguntas personales hacia Roy (que si tiene novia, que si salen), reclamos personales, cualquier cosa que no mueva el embudo.

Si el mensaje MEZCLA las dos cosas (algo del embudo + algo social), es EMBUDO.

Responde ÚNICAMENTE una palabra: EMBUDO o SOCIAL.`,
      messages: [
        {
          role: "user",
          content: `${transcript}\n\nÚLTIMO MENSAJE DEL CLIENTE: ${lastMessage ?? ""}`,
        },
      ],
    });

    const veredicto = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim()
      .toUpperCase();
    return veredicto.includes("EMBUDO");
  } catch (error) {
    console.error("esRelevanteAlEmbudo falló (se calla el bot):", error);
    return false;
  }
}
