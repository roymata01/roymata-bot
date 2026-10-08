import { createAdminClient } from "@/lib/supabase/admin";
import { enviarOggWhatsApp, enviarInstagram, enviarMessenger } from "@/lib/voz/enviar-audio-respuesta";
import type { Channel } from "@/types/database";

// Notas de voz REALES de Roy, grabadas por él (2026-10-07) para el embudo del
// curso grabado. La IA las pide escribiendo una burbuja que sea SOLO el
// marcador, p. ej. [AUDIO:curso]; el pipeline la detecta y manda el archivo.
// Archivos en el bucket clases/bot-audios: roy-{key}.ogg (WhatsApp, nota de
// voz) y roy-{key}.wav (Instagram/Messenger, por URL pública).

export const AUDIOS_ROY = {
  curso: "como funciona el curso grabado",
  garantia: "la garantia de 7 dias",
  empujon: "animate, no te vas a arrepentir",
  papas: "para papas con hijos chicos",
  soy_yo: "si, soy yo de verdad",
  // solo lo usa la insistida automática (no está en la KB a propósito)
  seguimiento: "seguimiento: paso a ver si te intereso el curso",
} as const;

export type AudioRoyKey = keyof typeof AUDIOS_ROY;

/** Si una burbuja es un marcador de audio ("[AUDIO:curso]"), devuelve la clave. */
export function markerAudio(texto: string): AudioRoyKey | null {
  const m = /^\[AUDIO:([a-z_]+)\]$/i.exec((texto ?? "").trim());
  const key = m?.[1]?.toLowerCase();
  return key && key in AUDIOS_ROY ? (key as AudioRoyKey) : null;
}

export async function enviarAudioPregrabado(
  channel: Channel,
  externalId: string,
  key: AudioRoyKey
): Promise<string> {
  const storage = createAdminClient().storage.from("clases");
  if (channel === "whatsapp") {
    const { data, error } = await storage.download(`bot-audios/roy-${key}.ogg`);
    if (error || !data) throw new Error(`No está el audio roy-${key}.ogg: ${error?.message}`);
    return enviarOggWhatsApp(externalId, new Uint8Array(await data.arrayBuffer()));
  }
  const url = storage.getPublicUrl(`bot-audios/roy-${key}.wav`).data.publicUrl;
  if (channel === "instagram") return enviarInstagram(externalId, url);
  return enviarMessenger(externalId, url);
}
