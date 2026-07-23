import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Contadores del dashboard de Inicio: qué necesita atención hoy.
export async function GET() {
  const supabaseAuth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const en7dias = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const inicioMes = hoy.slice(0, 8) + "01";

  const [porAtender, sinLeer, cotizaciones, ticketsPend, ticketsUrgen, gasto, invitados] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "por_atender"),
    supabase.from("conversations").select("unread_count").gt("unread_count", 0),
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "pendiente"),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "PENDIENTE"),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDIENTE")
      .lte("fecha_limite", en7dias),
    supabase.from("token_usage_logs").select("cost_usd").gte("created_at", inicioMes),
    supabase.from("comment_invites").select("id", { count: "exact", head: true }).eq("status", "sent"),
  ]);

  // registros del curso atribuidos al bot (base del proyecto de la página)
  let registrosBot = 0;
  try {
    const res = await fetch(`${process.env.VITA_SUPABASE_URL}/rest/v1/registrations?select=id&ref=not.is.null`, {
      headers: {
        apikey: process.env.VITA_SUPABASE_SERVICE_KEY!,
        Authorization: `Bearer ${process.env.VITA_SUPABASE_SERVICE_KEY!}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    });
    registrosBot = Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
  } catch {}

  return NextResponse.json({
    porAtender: porAtender.count ?? 0,
    sinLeer: (sinLeer.data ?? []).reduce((a, c) => a + (c.unread_count as number), 0),
    cotizacionesPendientes: cotizaciones.count ?? 0,
    ticketsPendientes: ticketsPend.count ?? 0,
    ticketsUrgentes: ticketsUrgen.count ?? 0,
    invitacionesEnviadas: invitados.count ?? 0,
    registrosBot,
    gastoIaMesUsd: (gasto.data ?? []).reduce((a, c) => a + Number(c.cost_usd ?? 0), 0),
  });
}
