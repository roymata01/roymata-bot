// Flujo "Instagram API with Instagram Login" -> graph.instagram.com, no graph.facebook.com
export async function sendInstagramMessage(recipientId: string, text: string): Promise<string> {
  const url = "https://graph.instagram.com/v21.0/me/messages";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.IG_PAGE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!res.ok) throw new Error(`Instagram send falló: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.message_id as string;
}
