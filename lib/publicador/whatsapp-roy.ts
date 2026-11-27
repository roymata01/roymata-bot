import { createAdminClient } from "@/lib/supabase/admin";

// WhatsApp entre el bot y Roy para el publicador.

const API = () => `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
const AUTH = () => ({ Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` });

export const NUMERO_ROY = process.env.ROY_WHATSAPP_ALERTAS || "522228067240";
const diez = (t: string) => (t || "").replace(/\D/g, "").slice(-10);

/** Solo el número personal de Roy puede mandar videos y decir "publicar". */
export const esRoy = (from: string) => diez(from) === diez(NUMERO_ROY);

async function enviar(cuerpo: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${API()}/messages`, {
    method: "POST",
    headers: { ...AUTH(), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: NUMERO_ROY, ...cuerpo }),
  });
  if (!res.ok) throw new Error(`WhatsApp a Roy falló: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const d = await res.json();
  return d.messages?.[0]?.id as string;
}

/** Texto libre (WhatsApp corta en 4,096; se parte por párrafos si hace falta). */
export async function textoARoy(texto: string): Promise<void> {
  const trozos: string[] = [];
  let actual = "";
  for (const p of texto.split("\n\n")) {
    if ((actual + "\n\n" + p).length > 3900 && actual) {
      trozos.push(actual);
      actual = p;
    } else {
      actual = actual ? `${actual}\n\n${p}` : p;
    }
  }
  if (actual) trozos.push(actual);
  for (const t of trozos) await enviar({ type: "text", text: { body: t.slice(0, 4096), preview_url: false } });
}

export async function documentoARoy(mediaId: string, nombre: string, pie?: string): Promise<void> {
  await enviar({ type: "document", document: { id: mediaId, filename: nombre, ...(pie ? { caption: pie.slice(0, 1024) } : {}) } });
}

export async function videoARoy(mediaId: string, pie?: string): Promise<void> {
  await enviar({ type: "video", video: { id: mediaId, ...(pie ? { caption: pie.slice(0, 1024) } : {}) } });
}

/** Aviso por plantilla aprobada (aviso_sistema_vita) para abrir la ventana de 24 h. */
export async function avisoPlantillaARoy(texto: string): Promise<void> {
  await enviar({
    type: "template",
    template: {
      name: "aviso_sistema_vita",
      language: { code: "es_MX" },
      components: [
        { type: "body", parameters: [{ type: "text", text: texto.replace(/\s+/g, " ").trim().slice(0, 900) }] },
      ],
    },
  });
}

/** True si Roy le escribió al bot en las últimas ~23.5 h (mensajes libres permitidos). */
export async function ventanaAbiertaRoy(): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("contacts")
    .select("external_id, last_contact_at")
    .eq("channel", "whatsapp")
    .like("external_id", `%${diez(NUMERO_ROY)}`);
  const ultimo = Math.max(0, ...(data ?? []).map((c) => (c.last_contact_at ? Date.parse(c.last_contact_at) : 0)));
  return Date.now() - ultimo < 23.5 * 3600_000;
}

/** Baja un archivo que llegó al WhatsApp del bot (video o documento). */
export async function bajarMediaWhatsApp(mediaId: string): Promise<{ bytes: Buffer; mime: string }> {
  const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: AUTH() }).then((r) => r.json());
  if (!meta?.url) throw new Error(`WhatsApp no dio la URL del archivo: ${JSON.stringify(meta).slice(0, 200)}`);
  const r = await fetch(meta.url, { headers: AUTH() });
  if (!r.ok) throw new Error(`No pude bajar el archivo de WhatsApp (${r.status})`);
  return { bytes: Buffer.from(await r.arrayBuffer()), mime: meta.mime_type ?? "video/mp4" };
}
