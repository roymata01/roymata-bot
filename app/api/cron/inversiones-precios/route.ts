import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

// Cron diario (vercel.json, 21:00 UTC = 3pm CDMX, mercado ya cerrado): actualiza el precio actual
// de cada posición con el precio de mercado en USD (Yahoo Finance) × tipo de
// cambio USD/MXN del momento — así es como GBM valúa el SIC. No usamos los
// tickers .MX porque en el SIC hay poca operación y los precios se quedan
// rancios (ej. ASML.MX marcaba la mitad del valor real).
// Vercel manda Authorization: Bearer CRON_SECRET.

async function precioYahoo(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === "number" && p > 0 ? p : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: posiciones } = await supabase.from("inversiones").select("id, clave, precio_actual");
  if (!posiciones?.length) return NextResponse.json({ ok: true, vacio: true });

  const fx = await precioYahoo("USDMXN=X");
  if (!fx) return NextResponse.json({ error: "No pude obtener el tipo de cambio USD/MXN." }, { status: 502 });

  const resultados: { clave: string; antes: number; ahora: number | null }[] = [];
  for (const p of posiciones) {
    const usd = await precioYahoo(p.clave);
    if (usd == null) {
      resultados.push({ clave: p.clave, antes: Number(p.precio_actual), ahora: null });
      continue; // ticker no encontrado: se conserva el precio manual
    }
    const precioMxn = Math.round(usd * fx * 100) / 100;
    await supabase
      .from("inversiones")
      .update({ precio_actual: precioMxn, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    resultados.push({ clave: p.clave, antes: Number(p.precio_actual), ahora: precioMxn });
    await new Promise((r) => setTimeout(r, 250));
  }

  // snapshot del día con los precios frescos
  const { data: pos2 } = await supabase.from("inversiones").select("cantidad, costo_promedio, precio_actual");
  const invertido = (pos2 || []).reduce((s, p) => s + Number(p.cantidad) * Number(p.costo_promedio), 0);
  const valor = (pos2 || []).reduce((s, p) => s + Number(p.cantidad) * Number(p.precio_actual), 0);
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  await supabase.from("inversiones_snapshots").upsert(
    { fecha: hoy, invertido: Math.round(invertido * 100) / 100, valor: Math.round(valor * 100) / 100 },
    { onConflict: "fecha" }
  );

  return NextResponse.json({ ok: true, fx, resultados, valor, invertido });
}
