// Envío de una plantilla de WhatsApp aprobada por Meta (para campañas fuera de
// la ventana de 24h). {{1}} = nombre; el botón URL es fijo en la plantilla.
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  lang: string,
  nombre: string
): Promise<string> {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: lang },
        components: [{ type: "body", parameters: [{ type: "text", text: nombre || "hola" }] }],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp template falló: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.messages?.[0]?.id as string;
}

// Normaliza a E.164 mexicano: 52 + 10 dígitos. Acepta con/sin +, con/sin el
// "1" de móvil viejo, con lada 044/045. Devuelve null si no parece válido.
export function normalizaTelMx(raw: string): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("52")) d = d.slice(2);
  if (d.startsWith("1") && d.length === 11) d = d.slice(1); // 1 + 10 (móvil viejo)
  if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  if (d.length !== 10) return null;
  return "52" + d;
}
