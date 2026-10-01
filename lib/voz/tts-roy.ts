// Voz oficial de Roy (clon sellado por él, 30-sep-2026) con el preset
// calibrado en ~11 rondas. NO cambiar settings sin su visto bueno.
// eleven_v3 queda prohibido para esta voz (le cambia el acento a "regio").

const VOICE_ID_ROY = "gAnremFqkMuh8SspeMjF";

export async function ttsRoy(texto: string, outputFormat: string): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID_ROY}?output_format=${outputFormat}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: texto,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 1.0, style: 0.12, speed: 1.15 },
      }),
    }
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

// Lo que se escribe para leerse no es lo que se habla: fuera emojis y links,
// y los "..." se vuelven comas (el motor alarga las palabras con ellos).
export function limpiarParaVoz(texto: string): string {
  return texto
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/\.{3,}|…/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// PCM 16-bit mono -> WAV (IG y Messenger aceptan wav por URL; mp3/ogg no).
export function pcmAWav(pcm: Buffer, sampleRate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
