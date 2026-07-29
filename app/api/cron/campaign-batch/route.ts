import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCampaignBatch } from "@/lib/inbox/run-campaign";

// Cron diario: continúa las campañas "enviando". Una sola invocación de Vercel
// alcanza ~25 envíos (pausa anti-spam de 1.5s con presupuesto de 50s), así que
// al terminar su tanda esta ruta se re-invoca a sí misma con presupuesto
// fresco, hasta completar el tope por_dia del día (día calendario de CDMX)
// o agotar los pendientes. Sin esto, el cron enviaba ~25 al día en total.
export const maxDuration = 60;

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

  const r = await runCampaignBatch(campaign.id);

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
    after(() =>
      fetch(`https://${host}/api/cron/campaign-batch`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).catch(() => {})
    );
  }
  return NextResponse.json({ ...r, enviadosHoy: enviadosHoy ?? 0, continua });
}
