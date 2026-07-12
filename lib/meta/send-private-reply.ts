// "Private reply": contesta un comentario con un mensaje privado.
// Meta solo permite UNA private reply por comentario y dentro de los 7 días.
// La respuesta incluye recipient_id: el ID de mensajería (PSID/IGSID) de la
// persona — oro puro, porque permite guardar su nombre en contacts aunque la
// API de perfiles esté bloqueada (requiere revisión especial de Meta).

export interface PrivateReplyResult {
  messageId: string;
  recipientId: string | null;
}

// Flujo "Instagram API with Instagram Login" -> graph.instagram.com
export async function sendInstagramPrivateReply(commentId: string, text: string): Promise<PrivateReplyResult> {
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
  return { messageId: data.message_id as string, recipientId: (data.recipient_id as string) ?? null };
}

// Igual pero para comentarios en posts de la Página de Facebook (via Messenger).
export async function sendMessengerPrivateReply(commentId: string, text: string): Promise<PrivateReplyResult> {
  const res = await fetch("https://graph.facebook.com/v21.0/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FB_PAGE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
    }),
  });

  if (!res.ok) throw new Error(`Messenger private reply falló: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { messageId: data.message_id as string, recipientId: (data.recipient_id as string) ?? null };
}
