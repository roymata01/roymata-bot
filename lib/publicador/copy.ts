import { createAnthropicClient } from "@/lib/anthropic";
import type { Copys } from "@/lib/publicador/redes";
import type { InfoVideo } from "@/lib/publicador/mp4-info";

// Copys por red con la voz de Roy (mismas reglas que la skill publicar de la Mac).

const MODELO = "claude-sonnet-5-5";

const REGLAS = `Escribes los copys de las redes de Roy Mata (@roymata01), paramédico mexicano y creador de contenido de primeros auxilios (VITA RESCUE, 6M+ seguidores).
Voz de Roy, español de México, como sus posts reales: "Cuál es la función del RCP? 🚨🚑 #primerosauxilios", "El poder de la aspirina 💊 #primerosauxilios".
Reglas:
- NUNCA signos de apertura ¿ ni ¡ (solo los de cierre ? y !).
- Frases cortas. 1 a 3 emojis (🚨🚑 son su firma).
- Datos de salud: SOLO lo que dice el video. Nunca inventes cifras, porcentajes, dosis ni tiempos que no estén en la transcripción.
- #primerosauxilios siempre que el tema sea de salud.
- instagram: gancho de 1 línea + 1–2 líneas de valor + CTA suave (guárdalo / compártelo con quien lo necesite) + 3–6 hashtags. Máx 2,200 caracteres.
- facebook: igual que instagram pero con 2–3 hashtags.
- youtube: "titulo" de máximo 100 caracteres, gancho claro que la gente buscaría; "descripcion" 2–4 líneas + hashtags; "etiquetas" 5–10 palabras clave.
- tiktok: máximo 150 caracteres, estilo de sus posts, con 2–4 hashtags.
- Si el video es de un servicio (conferencia, cursos), usa solo los datos de contacto que vengan en la nota de Roy.

Ejemplo real aprobado por Roy (video de la señal SOS):
{"instagram":"Si ves una luz en la montaña haciendo esto, alguien está pidiendo ayuda 🚨🆘\\n\\nLa señal SOS en clave Morse es: 3 cortos, 3 largos, 3 cortos. Sirve con linterna y con silbato, en la montaña, el bosque o donde te pierdas.\\n\\nGuárdalo y compártelo con quien sale a la montaña ⛰️\\n\\n#primerosauxilios #sos #montañismo #senderismo #roymataparamedic","facebook":"Si ves una luz en la montaña haciendo esto, alguien está pidiendo ayuda 🚨🆘\\n\\nLa señal SOS en clave Morse es: 3 cortos, 3 largos, 3 cortos. Sirve con linterna y con silbato, en la montaña, el bosque o donde te pierdas.\\n\\nCompártelo con quien sale a la montaña ⛰️\\n\\n#primerosauxilios #sos","youtube":{"titulo":"Cómo pedir ayuda si te pierdes en la montaña: señal SOS 🆘 #Shorts","descripcion":"La señal SOS en clave Morse: 3 cortos, 3 largos, 3 cortos. Con linterna de noche o con silbato, en la montaña, el bosque o donde te pierdas.\\n\\n#primerosauxilios #sos #montañismo #roymataparamedic","etiquetas":["señal sos","clave morse","pedir ayuda","perdido en la montaña","senderismo","primeros auxilios","rescate","roy mata"]},"tiktok":"Si te pierdes en la montaña, así se pide ayuda 🚨🆘 3 cortos, 3 largos, 3 cortos #primerosauxilios #sos #montaña"}

Responde SOLO con el JSON, sin texto antes ni después.`;

function sacarJson(texto: string): Record<string, unknown> {
  const i = texto.indexOf("{");
  const f = texto.lastIndexOf("}");
  if (i < 0 || f < i) throw new Error("Claude no regresó JSON");
  return JSON.parse(texto.slice(i, f + 1));
}

const sinApertura = (s: string) => s.replace(/[¿¡]/g, "");

/** Limpia y aplica las reglas duras (sin ¿¡, título ≤100 con #Shorts si toca). */
export function pulirCopys(c: Copys, info: InfoVideo | null): Copys {
  const out: Copys = {};
  if (c.instagram) out.instagram = sinApertura(c.instagram).slice(0, 2200);
  if (c.facebook) out.facebook = sinApertura(c.facebook);
  if (c.tiktok) out.tiktok = sinApertura(c.tiktok).slice(0, 2200);
  if (c.youtube?.titulo) {
    const short = !info || (info.vertical && info.duracion <= 180);
    let titulo = sinApertura(c.youtube.titulo).trim();
    if (short && !/#shorts/i.test(titulo)) {
      titulo = titulo.slice(0, 100 - " #Shorts".length).trim() + " #Shorts";
    }
    if (!short) titulo = titulo.replace(/\s*#shorts/gi, "");
    out.youtube = {
      titulo: titulo.slice(0, 100),
      descripcion: sinApertura(c.youtube.descripcion ?? ""),
      etiquetas: (c.youtube.etiquetas ?? []).slice(0, 15),
    };
  }
  return out;
}

export async function escribirCopys(args: {
  transcripcion: string;
  nota: string | null;
  nombreArchivo: string;
  info: InfoVideo | null;
}): Promise<Copys> {
  const { transcripcion, nota, nombreArchivo, info } = args;
  const datos = [
    `Archivo: ${nombreArchivo}`,
    info ? `Duración: ${info.duracion} s, ${info.vertical ? "vertical" : "horizontal"}` : "",
    nota ? `Nota de Roy al mandarlo: ${nota}` : "",
    `Lo que se dice en el video (transcripción automática):\n${transcripcion || "(no se escucha voz)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await createAnthropicClient().messages.create({
    model: MODELO,
    max_tokens: 2000,
    system: REGLAS,
    messages: [
      {
        role: "user",
        content: `${datos}\n\nEscribe el JSON con instagram, facebook, youtube {titulo, descripcion, etiquetas} y tiktok.`,
      },
    ],
  });
  const texto = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return pulirCopys(sacarJson(texto) as Copys, info);
}

/**
 * Roy contestó algo que no es "publicar" ni "cancelar". Si es un cambio a los
 * copys, regresa los copys corregidos; si es otra cosa (plática normal), null.
 */
export async function editarCopys(args: {
  copys: Copys;
  instruccion: string;
  transcripcion: string;
  info: InfoVideo | null;
}): Promise<Copys | null> {
  const res = await createAnthropicClient().messages.create({
    model: MODELO,
    max_tokens: 2000,
    system: `${REGLAS}

Ahora Roy ya vio estos copys y te contestó por WhatsApp. Si su mensaje pide un cambio a los copys (de una red o de todas), aplica SOLO ese cambio y regresa {"cambio": true, "copys": {…los 4 copys completos…}}.
Si su mensaje no tiene que ver con los copys de este video, regresa {"cambio": false}.`,
    messages: [
      {
        role: "user",
        content: `Copys actuales:\n${JSON.stringify(args.copys)}\n\nTranscripción del video:\n${args.transcripcion || "(sin voz)"}\n\nMensaje de Roy:\n${args.instruccion}`,
      },
    ],
  });
  const texto = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const d = sacarJson(texto) as { cambio?: boolean; copys?: Copys };
  if (!d.cambio || !d.copys) return null;
  return pulirCopys({ ...args.copys, ...d.copys }, args.info);
}

export async function transcribir(video: Buffer, nombre: string, mime: string): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return "";
  const fd = new FormData();
  fd.set("model_id", "scribe_v1");
  fd.set("language_code", "spa");
  fd.set("file", new Blob([new Uint8Array(video)], { type: mime || "video/mp4" }), nombre || "video.mp4");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: fd,
  });
  if (!r.ok) {
    console.error("Scribe:", r.status, (await r.text()).slice(0, 300));
    return "";
  }
  const d = await r.json();
  return (d.text as string) ?? "";
}
