// "Private reply": contesta un comentario de Instagram con un mensaje privado.
// Meta solo permite UNA private reply por comentario y dentro de los 7 días.
// Flujo "Instagram API with Instagram Login" -> graph.instagram.com
export async function sendInstagramPrivateReply(commentId: string, text: string): Promise<string> {
  const res = await fetch("https://graph.instagram.com/v21.0/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.IG_PAGE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
    }),
  });

  if (!res.ok) throw new Error(`Instagram private reply falló: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.message_id as string;
}
