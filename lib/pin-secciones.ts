// ============================================================
// Candado de PIN para las secciones privadas del sistema (Roy, 9-nov-2026):
// "El Bot" y "Personal" piden un PIN extra; "Trabajo — VITA" queda libre
// para los externos que entran con la cuenta de Roy.
//
// El PIN vive en la variable de entorno PIN_MUNDOS (Vercel). El candado se
// aplica en el SERVIDOR (proxy.ts): aunque alguien conozca la URL directa,
// sin PIN no pasa. Si la variable no existe, no hay candado (así nada se
// rompe en entornos sin configurar).
// ============================================================

export const COOKIE_PIN = "pin_secciones";

/** Mundos del launcher que piden PIN (para el candadito 🔒 del hub). */
export const MUNDOS_CON_PIN = ["bot", "personal"];

/** Rutas protegidas: todos los apartados de "El Bot" y "Personal".
 *  OJO: proxy.ts lleva esta MISMA lista en su matcher (debe ser literal);
 *  si agregas una ruta aquí, agrégala también allá. */
export const PREFIJOS_PIN = [
  // El Bot
  "/personalizacion",
  "/flujo",
  "/templates",
  "/workflows",
  "/probar-bot",
  "/tiktok",
  "/costos",
  // Personal
  "/finanzas",
  "/inversiones",
  "/facturacion",
];

/** El valor que viaja en la cookie: un hash del PIN, nunca el PIN.
 *  Si Roy cambia el PIN, todas las cookies viejas dejan de servir solas. */
export async function tokenDePin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`pin-secciones-v1:${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
