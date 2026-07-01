export async function sendWhatsAppMessage(to: string, text: string): Promise<string> {
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
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) throw new Error(`WhatsApp send falló: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.messages?.[0]?.id as string;
}
