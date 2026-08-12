import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Cron diario (vercel.json, 22:00 UTC = 4pm CDMX, ya cerró el mercado):
// guarda el punto del día para la gráfica de evolución del portafolio,
// aunque Roy no abra el dashboard. Vercel manda Authorization: Bearer CRON_SECRET.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: posiciones } = await supabase.from("inversiones").select("cantidad, costo_promedio, precio_actual");
  if (!posiciones?.length) return NextResponse.json({ ok: true, vacio: true });

  const invertido = posiciones.reduce((s, p) => s + Number(p.cantidad) * Number(p.costo_promedio), 0);
  const valor = posiciones.reduce((s, p) => s + Number(p.cantidad) * Number(p.precio_actual), 0);
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  await supabase.from("inversiones_snapshots").upsert(
    { fecha: hoy, invertido: Math.round(invertido * 100) / 100, valor: Math.round(valor * 100) / 100 },
    { onConflict: "fecha" }
  );
  return NextResponse.json({ ok: true, fecha: hoy, invertido, valor });
}
