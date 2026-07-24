import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCampaignBatch } from "@/lib/inbox/run-campaign";

// Cron diario: continúa las campañas "enviando" con una tanda más (calienta el
// número enviando por_dia al día, no todo de golpe).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data: activas } = await supabase.from("wa_campaigns").select("id").eq("status", "enviando").limit(1);
  if (!activas?.length) return NextResponse.json({ estado: "sin campañas activas" });

  const r = await runCampaignBatch(activas[0].id);
  return NextResponse.json(r);
}
