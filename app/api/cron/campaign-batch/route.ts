import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCampaignBatch } from "@/lib/inbox/run-campaign";

// Cron diario: continúa las campañas "enviando". Con 300s (el tope del plan) y
// la pausa anti-spam de 1.5s cada invocación alcanza ~180 envíos; al terminar su
// tanda la ruta se re-invoca a sí misma con presupuesto fresco, hasta completar
// el tope por_dia del día (calendario de CDMX) o agotar los pendientes. Antes
// era de 60s (~25 envíos) y sin cadena: el cron mandaba ~25 al día en total.
export const maxDuration = 300;
const PRESUPUESTO_MS = 280_000; // se detiene sola 20s antes del corte

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data: activas } = await supabase
    .from("wa_campaigns")
    .select("id, por_dia")
    .eq("status", "enviando")
    .limit(1);
  if (!activas?.length) return NextResponse.json({ estado: "sin campañas activas" });
  const campaign = activas[0];

  const r = await runCampaignBatch(campaign.id, PRESUPUESTO_MS);

  // Enviados en lo que va del día de CDMX (UTC-6, sin horario de verano)
  const ahora = new Date();
  const cdmx = new Date(ahora.getTime() - 6 * 3600_000);
  const inicioDia = new Date(
    Date.UTC(cdmx.getUTCFullYear(), cdmx.getUTCMonth(), cdmx.getUTCDate(), 6)
  ).toISOString();
  const { count: enviadosHoy } = await supabase
    .from("wa_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("status", "enviado")
    .gte("sent_at", inicioDia);

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const continua = r.quedan > 0 && (enviadosHoy ?? 0) < (campaign.por_dia ?? 200) && !!host;
  if (continua) {
    // Solo importa DESPACHAR la petición (la nueva invocación arranca sola en
    // el servidor); se aborta a los 5s para no esperar sus ~40s de respuesta.
    after(() =>
      fetch(`https://${host}/api/cron/campaign-batch`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {})
    );
  }
  return NextResponse.json({ ...r, enviadosHoy: enviadosHoy ?? 0, continua });
}
