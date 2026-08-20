import { VENTANA_ALERTA_HORAS, detectarPuesto, ultimos10 } from "@/lib/hyrox/config";

// Busca si a este teléfono le mandamos una alerta médica del evento.
//
// OJO: las alertas NO pasan por este bot — las manda la app de VITA RESCUE
// directo por la API de Meta, y las guarda en la tabla notificaciones_whatsapp
// de SU propio proyecto de Supabase (el de HYROX, no el de los cursos).
// Por eso esto consulta un Supabase distinto, con sus propias variables:
//   HYROX_SUPABASE_URL / HYROX_SUPABASE_KEY
// Si no están configuradas, esto simplemente no encuentra nada y la detección
// se apoya en las palabras clave. Nunca lanza: un fallo aquí no debe tumbar
// la respuesta al familiar.

export type AlertaEncontrada = { puesto: string | null; tipo: string | null; enviadaEn: string | null };

export async function buscarAlertaHyrox(telefono: string): Promise<AlertaEncontrada | null> {
  const url = process.env.HYROX_SUPABASE_URL;
  const key = process.env.HYROX_SUPABASE_KEY;
  if (!url || !key) return null;

  const diez = ultimos10(telefono);
  if (!diez) return null;

  const desde = new Date(Date.now() - VENTANA_ALERTA_HORAS * 3600_000).toISOString();
  const query =
    `notificaciones_whatsapp?select=tipo,mensaje_enviado,created_at` +
    `&destinatario_telefono=like.*${diez}` +
    `&created_at=gte.${desde}` +
    `&order=created_at.desc&limit=1`;

  try {
    const res = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("HYROX: no se pudo leer notificaciones_whatsapp:", res.status);
      return null;
    }
    const filas = (await res.json()) as { tipo: string; mensaje_enviado: string; created_at: string }[];
    if (!filas.length) return null;
    return {
      puesto: detectarPuesto(filas[0].mensaje_enviado),
      tipo: filas[0].tipo ?? null,
      enviadaEn: filas[0].created_at ?? null,
    };
  } catch (error) {
    console.error("HYROX: error consultando notificaciones_whatsapp:", error);
    return null;
  }
}
