import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// RECORDATORIOS CON FECHA (Roy 17-oct): tabla `recordatorios` (fecha, texto).
// Cada mañana, lo que toque HOY le llega a Roy por WhatsApp y se marca
// enviado. Los pendientes que Roy dicta con fecha se van sembrando aquí.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

  const { data: pendientes } = await supabase
    .from("recordatorios")
    .select("id, texto")
    .lte("fecha", hoy)
    .is("enviado_en", null)
    .limit(10);
  if (!pendientes?.length) return NextResponse.json({ nada: true });

  const texto = `Recordatorio de hoy: ${pendientes.map((p) => p.texto).join(" · ")}`;
  const r = await fetch(`${req.nextUrl.origin}/api/avisos/roy-wa`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "recordatorio", texto }),
  });
  if (r.ok) {
    await supabase
      .from("recordatorios")
      .update({ enviado_en: new Date().toISOString() })
      .in("id", pendientes.map((p) => p.id));
  }
  return NextResponse.json({ enviados: pendientes.length });
}
