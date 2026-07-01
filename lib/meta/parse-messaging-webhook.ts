import type { Channel } from "@/types/database";
import type { InboundMessage } from "@/lib/meta/types";

// Formato compartido por Instagram Messaging API y Messenger Platform:
// https://developers.facebook.com/docs/messenger-platform/webhooks
export function parseMessagingWebhook(
  body: unknown,
  channel: Extract<Channel, "instagram" | "messenger">
): InboundMessage[] {
  const results: InboundMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries as Record<string, unknown>[]) {
    const messaging = (entry.messaging as Record<string, unknown>[]) ?? [];

    for (const event of messaging) {
      const message = event.message as Record<string, unknown> | undefined;
      if (!message || message.is_echo) continue; // ignora el eco de lo que nosotros mismos enviamos

      const attachments = message.attachments as Record<string, unknown>[] | undefined;
      const firstAttachment = attachments?.[0];
      const attachmentPayload = firstAttachment?.payload as
        | Record<string, unknown>
        | undefined;

      results.push({
        channel,
        externalId: (event.sender as Record<string, unknown>).id as string,
        displayName: null, // requiere una llamada aparte a la Graph API para el perfil
        content: (message.text as string) ?? null,
        mediaUrl: (attachmentPayload?.url as string) ?? null,
        mediaType: (firstAttachment?.type as string) ?? null,
        metaMessageId: message.mid as string,
        timestamp: new Date(Number(event.timestamp)).toISOString(),
        raw: event,
      });
    }
  }

  return results;
}
