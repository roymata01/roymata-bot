import { createAdminClient } from "@/lib/supabase/admin";
import { igToken } from "@/lib/meta/ig-token";
import { ttsRoy, limpiarParaVoz, pcmAWav } from "@/lib/voz/tts-roy";
import type { Channel } from "@/types/database";

// Convierte un texto de respuesta en nota de voz con la voz de Roy y la envía
// por el canal que toque. Recetas probadas en campo (29/30-sep-2026):
//  - WhatsApp: Ogg Opus subido a /media + "voice": true (mic verde real)
//  - Instagram y Messenger: WAV por URL pública (bucket clases/bot-audios;
//    mp3 y ogg los rechazan). Ventana de 24 h en todos.
// Devuelve el meta_message_id. Si algo falla, lanza — el caller decide el
// fallback a texto.

export async function enviarAudioRespuesta(
  channel: Channel,
  externalId: string,
  texto: string
): Promise<string> {
  const limpio = limpiarParaVoz(texto);
  if (limpio.length < 12) throw new Error("Texto muy corto para audio");

  if (channel === "whatsapp") return enviarWhatsApp(externalId, limpio);
  const url = await subirWav(limpio);
  if (channel === "instagram") return enviarInstagram(externalId, url);
  return enviarMessenger(externalId, url);
}

async function enviarWhatsApp(to: string, texto: string): Promise<string> {
  const ogg = await ttsRoy(texto, "opus_48000_32"); // ya viene en Ogg Opus
  const base = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", "audio/ogg");
  fd.append("file", new Blob([new Uint8Array(ogg)], { type: "audio/ogg" }), "nota.ogg");
  const up = await fetch(`${base}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
    body: fd,
  });
  if (!up.ok) throw new Error(`WA media falló: ${up.status} ${await up.text()}`);
  const { id: mediaId } = await up.json();

  const res = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "audio",
      // voice:true = nota de voz auténtica (mic verde); sin ella sale como archivo
      audio: { id: mediaId, voice: true },
    }),
  });
  if (!res.ok) throw new Error(`WA audio falló: ${res.status} ${await res.text()}`);
  return (await res.json()).messages?.[0]?.id as string;
}

async function subirWav(texto: string): Promise<string> {
  const pcm = await ttsRoy(texto, "pcm_24000");
  const wav = pcmAWav(pcm, 24000);
  const ruta = `bot-audios/resp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.wav`;
  const storage = createAdminClient().storage.from("clases");
  const { error } = await storage.upload(ruta, wav, { contentType: "audio/wav" });
  if (error) throw new Error(`Storage: ${error.message}`);
  return storage.getPublicUrl(ruta).data.publicUrl;
}

async function enviarInstagram(recipientId: string, audioUrl: string): Promise<string> {
  const res = await fetch("https://graph.instagram.com/v21.0/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await igToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { attachment: { type: "audio", payload: { url: audioUrl } } },
    }),
  });
  if (!res.ok) throw new Error(`IG audio falló: ${res.status} ${await res.text()}`);
  return (await res.json()).message_id as string;
}

async function enviarMessenger(psid: string, audioUrl: string): Promise<string> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: { attachment: { type: "audio", payload: { url: audioUrl, is_reusable: false } } },
      }),
    }
  );
  if (!res.ok) throw new Error(`Messenger audio falló: ${res.status} ${await res.text()}`);
  return (await res.json()).message_id as string;
}
