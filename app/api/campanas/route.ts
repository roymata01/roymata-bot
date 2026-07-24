import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizaTelMx } from "@/lib/meta/send-whatsapp-template";
import { runCampaignBatch } from "@/lib/inbox/run-campaign";

export const maxDuration = 60;

async function auth(req: NextRequest): Promise<boolean> {
  const a = req.headers.get("authorization");
  if (process.env.CRON_SECRET && a === `Bearer ${process.env.CRON_SECRET}`) return true;
  const s = await createServerSupabaseClient();
  const {
    data: { user },
  } = await s.auth.getUser();
  return !!user;
}

// Crear campaña desde la lista de registrados con teléfono (opt-in).
export async function POST(req: NextRequest) {
  if (!(await auth(req))) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { nombre, template_name, template_lang, por_dia } = await req.json();
  if (!nombre || !template_name) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  const supabase = createAdminClient();

  // registrados con teléfono (base de la página del curso)
  const res = await fetch(
    `${process.env.VITA_SUPABASE_URL}/rest/v1/registrations?select=full_name,phone&phone=not.is.null`,
    {
      headers: {
        apikey: process.env.VITA_SUPABASE_SERVICE_KEY!,
        Authorization: `Bearer ${process.env.VITA_SUPABASE_SERVICE_KEY!}`,
      },
    }
  );
  const registros: { full_name: string | null; phone: string }[] = await res.json();

  // normaliza y deduplica por teléfono
  const porTel = new Map<string, string>();
  for (const r of registros) {
    const tel = normalizaTelMx(r.phone);
    if (tel && !porTel.has(tel)) porTel.set(tel, (r.full_name ?? "").split(/\s+/)[0] || "");
  }

  const { data: campaign, error } = await supabase
    .from("wa_campaigns")
    .insert({ nombre, template_name, template_lang: template_lang || "es_MX", por_dia: por_dia || 200, total: porTel.size })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // inserta destinatarios en lotes
  const filas = [...porTel].map(([phone, nom]) => ({ campaign_id: campaign.id, phone, nombre: nom }));
  for (let i = 0; i < filas.length; i += 500) {
    await supabase.from("wa_campaign_recipients").upsert(filas.slice(i, i + 500), { onConflict: "campaign_id,phone" });
  }

  return NextResponse.json({ id: campaign.id, total: porTel.size });
}

// Lanzar/continuar el envío de una campaña (una tanda en segundo plano).
export async function PATCH(req: NextRequest) {
  if (!(await auth(req))) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id, accion } = await req.json();
  const supabase = createAdminClient();

  if (accion === "pausar") {
    await supabase.from("wa_campaigns").update({ status: "pausada" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  // iniciar / reanudar
  await supabase.from("wa_campaigns").update({ status: "enviando" }).eq("id", id);
  after(() => runCampaignBatch(id));
  return NextResponse.json({ ok: true });
}
