import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/meta/send-whatsapp-template";

// Envía una tanda de la campaña: toma destinatarios pendientes (hasta el tope
// por_dia), salta a los que se dieron de baja, y manda la plantilla con una
// pausa entre cada uno para no disparar los filtros anti-spam de WhatsApp.
const PAUSA_MS = 1500;
const PRESUPUESTO_MS = 50_000; // Vercel corta a 60s; se detiene antes solo

export async function runCampaignBatch(campaignId: string): Promise<{ enviados: number; fallidos: number; quedan: number }> {
  const inicio = Date.now();
  const supabase = createAdminClient();

  const { data: campaign } = await supabase.from("wa_campaigns").select("*").eq("id", campaignId).single();
  if (!campaign || campaign.status !== "enviando") return { enviados: 0, fallidos: 0, quedan: 0 };

  const { data: optouts } = await supabase.from("wa_optouts").select("phone");
  const baja = new Set((optouts ?? []).map((o) => o.phone));

  const { data: pendientes } = await supabase
    .from("wa_campaign_recipients")
    .select("id, phone, nombre")
    .eq("campaign_id", campaignId)
    .eq("status", "pendiente")
    .limit(campaign.por_dia);

  let enviados = 0;
  let fallidos = 0;
  for (const r of pendientes ?? []) {
    if (Date.now() - inicio > PRESUPUESTO_MS) break;

    if (baja.has(r.phone)) {
      await supabase.from("wa_campaign_recipients").update({ status: "baja" }).eq("id", r.id);
      continue;
    }
    try {
      await sendWhatsAppTemplate(r.phone, campaign.template_name, campaign.template_lang, r.nombre ?? "");
      await supabase.from("wa_campaign_recipients").update({ status: "enviado", sent_at: new Date().toISOString() }).eq("id", r.id);
      enviados++;
    } catch (error) {
      await supabase.from("wa_campaign_recipients").update({ status: "fallido", error: String(error).slice(0, 300) }).eq("id", r.id);
      fallidos++;
    }
    await new Promise((res) => setTimeout(res, PAUSA_MS));
  }

  // actualiza contadores y cierra si ya no quedan pendientes
  const { count: quedan } = await supabase
    .from("wa_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pendiente");

  await supabase
    .from("wa_campaigns")
    .update({
      enviados: (campaign.enviados ?? 0) + enviados,
      fallidos: (campaign.fallidos ?? 0) + fallidos,
      status: (quedan ?? 0) === 0 ? "completada" : "enviando",
    })
    .eq("id", campaignId);

  return { enviados, fallidos, quedan: quedan ?? 0 };
}
