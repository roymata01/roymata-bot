export interface InstagramComment {
  commentId: string;
  mediaId: string | null;
  userId: string; // OJO: es el id de usuario de comentarios, NO el IGSID de mensajería
  username: string | null;
  text: string | null;
  raw: unknown;
}

// Los comentarios llegan por el mismo webhook de Instagram pero en entry[].changes
// (campo "comments"), no en entry[].messaging como los mensajes.
// https://developers.facebook.com/docs/instagram-platform/webhooks
export function parseInstagramCommentWebhook(body: unknown): InstagramComment[] {
  const results: InstagramComment[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries as Record<string, unknown>[]) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];

    for (const change of changes) {
      if (change.field !== "comments") continue;
      const value = change.value as Record<string, unknown> | undefined;
      if (!value?.id) continue;

      const from = value.from as Record<string, unknown> | undefined;
      const media = value.media as Record<string, unknown> | undefined;
      if (!from?.id) continue;

      results.push({
        commentId: value.id as string,
        mediaId: (media?.id as string) ?? null,
        userId: from.id as string,
        username: (from.username as string) ?? null,
        text: (value.text as string) ?? null,
        raw: change,
      });
    }
  }

  return results;
}
