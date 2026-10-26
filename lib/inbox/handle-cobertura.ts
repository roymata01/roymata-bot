import { createAdminClient } from "@/lib/supabase/admin";

// CONVOCATORIAS DE COBERTURA: cuando un paramédico convocado responde al
// WhatsApp de VITA, Roy recibe aviso inmediato en su teléfono y la IA queda
// FUERA de esa conversación (nada de embudos a alguien confirmando chamba).
//
// La lista de convocados NO vive en el código (son datos personales): está
// en bot_flujos con id "cobertura-activa":
//   { "caduca": "2026-10-29T06:00:00Z", "paramedicos": { "<10 dígitos>": "Nombre" } }
// Para una nueva convocatoria solo se actualiza esa fila.

type ConfigCobertura = { caduca?: string; paramedicos?: Record<string, string> };

let cache: { config: ConfigCobertura | null; leido: number } = { config: null, leido: 0 };

async function configCobertura(): Promise<ConfigCobertura | null> {
  if (Date.now() - cache.leido < 60_000) return cache.config;
  try {
    const { data } = await createAdminClient()
      .from("bot_flujos")
      .select("data")
      .eq("id", "cobertura-activa")
      .maybeSingle();
    cache = { config: (data?.data as ConfigCobertura) ?? null, leido: Date.now() };
  } catch {
    cache = { config: null, leido: Date.now() };
  }
  return cache.config;
}

/** Nombre del paramédico convocado, o null. Matchea por los últimos 10
 *  dígitos: Meta manda wa_id como 521..., 52... o el número pelón. */
export async function paramedicoCobertura(telefono: string): Promise<string | null> {
  const config = await configCobertura();
  if (!config?.paramedicos) return null;
  if (config.caduca && Date.now() > new Date(config.caduca).getTime()) return null;
  const ultimos = String(telefono ?? "").replace(/\D/g, "").slice(-10);
  return config.paramedicos[ultimos] ?? null;
}

/** Aviso a Roy + IA fuera de la conversación. Nunca lanza (el mensaje del
 *  paramédico ya quedó guardado en el inbox pase lo que pase). */
export async function manejarRespuestaCobertura(opts: {
  conversationId: string;
  nombre: string;
  texto: string;
}) {
  try {
    await createAdminClient()
      .from("conversations")
      .update({ ai_enabled: false })
      .eq("id", opts.conversationId);
  } catch (e) {
    console.error("cobertura: no se pudo pausar la IA:", e);
  }
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://sistema.vitarescue.com.mx";
    await fetch(`${base}/api/avisos/roy-wa`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tipo: "cobertura",
        texto: `🚑 Cobertura: ${opts.nombre} respondió: «${opts.texto.slice(0, 300)}». Contéstale desde el inbox del sistema`,
        detalle: opts.texto,
      }),
    });
  } catch (e) {
    console.error("cobertura: aviso a Roy falló:", e);
  }
}
