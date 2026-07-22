import { createAnthropicClient } from "@/lib/anthropic";

// OCR de tickets de compra con visión de Claude: extrae lo necesario para
// facturar en el portal de la tienda. NUNCA inventa datos — si algo no se lee,
// va como null y el ticket queda INCOMPLETO para revisión de Roy.

export interface DatosTicket {
  legible: boolean;
  tienda: string | null;
  fecha_compra: string | null; // YYYY-MM-DD
  monto: number | null;
  folio: string | null;
  datos_extra: Record<string, string>; // codigo_facturacion, estacion, sucursal, rfc_emisor...
  notas: string | null;
}

export async function analyzeTicket(imageBase64: string, mediaType: string): Promise<DatosTicket> {
  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 900,
    system: `Eres un extractor de datos de tickets de compra mexicanos para facturación (CFDI).

Extrae SOLO lo que se lea claramente en el ticket. NUNCA inventes ni adivines datos — un dato mal extraído genera una factura inválida ante el SAT. Si un campo no se distingue, usa null.

Busca especialmente los datos que los portales de facturación piden:
- OXXO: "código de facturación" al pie del ticket
- Gasolineras: folio/ticket + número de estación
- Súper/retail: folio, sucursal/tienda número, fecha, monto total, a veces "TR" o número de transacción
- El RFC del emisor si aparece

Responde ÚNICAMENTE con JSON válido:
{"legible": true/false, "tienda": "nombre comercial o null", "fecha_compra": "YYYY-MM-DD o null", "monto": número total o null, "folio": "... o null", "datos_extra": {"codigo_facturacion": "...", "sucursal": "...", "estacion": "...", "rfc_emisor": "...", "web_facturacion": "url si el ticket la imprime"}, "notas": "observaciones útiles para facturar, o null"}

En datos_extra incluye solo las llaves que realmente aparezcan en el ticket. "legible": false solo si la foto no sirve para facturar (borrosa, cortada, sin datos clave).`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg", data: imageBase64 },
          },
          { type: "text", text: "Extrae los datos de este ticket." },
        ],
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim()
    .replace(/^```json?\s*|\s*```$/g, "");

  // recorta al objeto JSON por si el modelo agregó texto alrededor
  const soloJson = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  return JSON.parse(soloJson) as DatosTicket;
}
