// Tarjeta de registro para Messenger (plantilla genérica): Messenger no genera
// vista previa de links mandados por bots, así que el link se acompaña con esta
// tarjeta con imagen + botón. Solo funciona con la ventana de 24h abierta
// (no en private replies), por eso va en keyword y seguimiento, no en la invitación.

const LINK_REGISTRO = "https://hemorragias-vita.vercel.app/?fb=1";

export async function sendMessengerLinkCard(recipientId: string): Promise<string> {
  const res = await fetch("https://graph.facebook.com/v21.0/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FB_PAGE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [
              {
                title: "VITA RESCUE — Clase Gratuita: Control de Hemorragias",
                subtitle: "Sábado 1 de agosto · 6:00 pm CDMX · 100% en vivo",
                image_url: "https://hemorragias-vita.vercel.app/opengraph-image",
                default_action: {
                  type: "web_url",
                  url: LINK_REGISTRO,
                },
                buttons: [
                  {
                    type: "web_url",
                    url: LINK_REGISTRO,
                    title: "Regístrate gratis",
                  },
                ],
              },
            ],
          },
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`Messenger card falló: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.message_id as string;
}
