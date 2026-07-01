import type { InboundMessage } from "@/lib/meta/types";

// Formato de payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
export function parseWhatsAppPayload(body: unknown): InboundMessage[] {
  const results: InboundMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries as Record<string, unknown>[]) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];

    for (const change of changes) {
      const value = change.value as Record<string, unknown> | undefined;
      const messages = value?.messages as Record<string, unknown>[] | undefined;
      if (!messages) continue; // ignora "statuses" (acuses de entrega/lectura)

      const contacts = value?.contacts as Record<string, unknown>[] | undefined;
      const profileName =
        (contacts?.[0]?.profile as Record<string, unknown> | undefined)?.name as
          | string
          | undefined;

      for (const message of messages) {
        const type = message.type as string;
        const text = (message.text as Record<string, unknown> | undefined)?.body as
          | string
          | undefined;

        results.push({
          channel: "whatsapp",
          externalId: message.from as string,
          displayName: profileName ?? null,
          content: type === "text" ? text ?? null : null,
          mediaUrl: null,
          mediaType: type !== "text" ? type : null,
          metaMessageId: message.id as string,
          timestamp: new Date(Number(message.timestamp) * 1000).toISOString(),
          raw: message,
        });
      }
    }
  }

  return results;
}
