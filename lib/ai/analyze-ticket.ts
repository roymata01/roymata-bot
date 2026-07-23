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
  categoria_gasto: string | null; // categoría del reporte de finanzas personales
}

// Categorías del reporte de gastos personales de Roy — deben coincidir con
// las de public/finanzas/index.html (BASE_EXP).
export const CATEGORIAS_GASTO = [
  "Renta / Oficina", "Pagos instructores", "Educación / Cursos", "Producción / Videos",
  "Personal / Grooming", "Hospedaje", "Paquetería", "Hogar / Mantenimiento", "Date",
  "Comida", "Bebidas", "Botanas", "Postres", "Restaurante", "Gasolina", "Casetas",
  "Telefonía", "Ropa", "Compras en línea", "Papelería", "Electrónica", "Empaque",
  "Estacionamiento", "Trámites", "Salud / Gym", "Medicamentos", "Membresías",
  "Deudas", "Otros", "Varios",
];

export async function analyzeTicket(imageBase64: string, mediaType: string): Promise<DatosTicket> {
  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 900,
    system: `Eres un extractor de datos de tickets de compra mexicanos para facturación (CFDI).

Extrae SOLO lo que se lea claramente en el ticket. NUNCA inventes ni adivines datos — un dato mal extraído genera una factura inválida ante el SAT. Si un campo no se distingue, usa null.

IMPORTANTE con fechas: los tickets mexicanos usan formato DÍA/MES/AÑO (09/07/2026 = 9 de julio, NO 7 de septiembre). Si la fecha es ambigua, asume día/mes/año.

Busca especialmente los datos que los portales de facturación piden:
- OXXO: "código de facturación" al pie del ticket
- Gasolineras: folio/ticket + número de estación
- Súper/retail: folio, sucursal/tienda número, fecha, monto total, a veces "TR" o número de transacción
- El RFC del emisor si aparece

Además clasifica el gasto en UNA de estas categorías del reporte personal de gastos (elige por el giro de la tienda y los productos del ticket):
${CATEGORIAS_GASTO.join(" | ")}
Guías: tiendas de conveniencia (OXXO, 7-Eleven) → "Botanas" si son snacks/bebidas, "Comida" si es comida; cine → "Date"; gasolinera → "Gasolina"; súper (Soriana, Costco, Walmart) → "Comida" salvo que el ticket muestre otra cosa. Si no hay una categoría clara usa "Varios".

Responde ÚNICAMENTE con JSON válido:
{"legible": true/false, "tienda": "nombre comercial o null", "fecha_compra": "YYYY-MM-DD o null", "monto": número total o null, "folio": "... o null", "datos_extra": {"codigo_facturacion": "...", "sucursal": "...", "estacion": "...", "rfc_emisor": "...", "web_facturacion": "url si el ticket la imprime"}, "notas": "observaciones útiles para facturar, o null", "categoria_gasto": "una categoría de la lista o null"}

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
