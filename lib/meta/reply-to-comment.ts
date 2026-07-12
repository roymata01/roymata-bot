// Respuesta PÚBLICA a un comentario ("Te mandé la info por DM 👀"): manda a la
// gente a su bandeja y les enseña a los demás que comentando reciben algo.

export async function replyToInstagramComment(commentId: string, text: string): Promise<void> {
  const res = await fetch(`https://graph.instagram.com/v21.0/${commentId}/replies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.IG_PAGE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: text }),
  });
  if (!res.ok) throw new Error(`Instagram comment reply falló: ${res.status} ${await res.text()}`);
}

export async function replyToFacebookComment(commentId: string, text: string): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${commentId}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FB_PAGE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: text }),
  });
  if (!res.ok) throw new Error(`Facebook comment reply falló: ${res.status} ${await res.text()}`);
}

// Variedad para no parecer sello de goma en los posts
const RESPUESTAS_PUBLICAS = [
  "Te mandé la info por DM 👀",
  "Te lo mandé por DM ✅",
  "Revisa tu bandeja, te escribí 📩",
  "Ya te escribí por DM 🚑",
];

export function respuestaPublicaAleatoria(): string {
  return RESPUESTAS_PUBLICAS[Math.floor(Math.random() * RESPUESTAS_PUBLICAS.length)];
}
