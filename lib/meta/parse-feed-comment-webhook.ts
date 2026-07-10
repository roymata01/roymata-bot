export interface FacebookComment {
  commentId: string;
  postId: string | null;
  userId: string; // id de usuario con alcance de la Página (no sirve para Send API directo)
  userName: string | null; // Facebook sí manda el nombre real del comentarista
  text: string | null;
  raw: unknown;
}

// Los comentarios de la Página llegan por el webhook de Messenger pero en
// entry[].changes (campo "feed"), no en entry[].messaging como los mensajes.
// El campo feed también trae likes, posts nuevos, etc. — solo nos interesan
// los comentarios agregados.
export function parseFacebookCommentWebhook(body: unknown): FacebookComment[] {
  const results: FacebookComment[] = [];
  if ((body as { object?: string })?.object !== "page") return results;
  const entries = (body as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries as Record<string, unknown>[]) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];

    for (const change of changes) {
      if (change.field !== "feed") continue;
      const value = change.value as Record<string, unknown> | undefined;
      if (value?.item !== "comment" || value?.verb !== "add") continue;

      const from = value.from as Record<string, unknown> | undefined;
      if (!from?.id || !value.comment_id) continue;

      results.push({
        commentId: value.comment_id as string,
        postId: (value.post_id as string) ?? null,
        userId: from.id as string,
        userName: (from.name as string) ?? null,
        text: (value.message as string) ?? null,
        raw: change,
      });
    }
  }

  return results;
}
