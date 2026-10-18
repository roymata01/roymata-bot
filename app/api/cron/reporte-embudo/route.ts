import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// REPORTE DIARIO DEL EMBUDO (Roy 17-oct): cada noche, el pulso del negocio
// al WhatsApp de Roy — QUIEROs, videos enviados, datos capturados y ventas.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const hace24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [{ data: invites }, { data: videos }, { data: lista }, { data: ventas }, { data: pedidos }] =
    await Promise.all([
      supabase.from("comment_invites").select("comment_text").gt("created_at", hace24h).limit(1000),
      supabase
        .from("messages")
        .select("conversation_id")
        .eq("direction", "out")
        .ilike("content", "%/heroe%")
        .gt("created_at", hace24h)
        .limit(2000),
      supabase.from("lista_espera_gen2").select("id").gt("updated_at", hace24h).limit(500),
      supabase.from("heroe_alumnos").select("email").gt("inscrito_en", hace24h).limit(200),
      supabase.from("pedidos").select("total_centavos").eq("estado", "pagado").gt("pagado_at", hace24h).limit(200),
    ]);

  const quieros = (invites ?? []).filter((i) => /quiero/i.test(String(i.comment_text ?? ""))).length;
  const videosEnviados = new Set((videos ?? []).map((v) => v.conversation_id)).size;
  const ventasHeroe = ventas?.length ?? 0;
  const ventasTienda = pedidos?.length ?? 0;
  const ingresos = ventasHeroe * 997 + (pedidos ?? []).reduce((s, p) => s + (p.total_centavos as number), 0) / 100;

  const texto = `Corte del día — QUIERO: ${quieros} · videos enviados: ${videosEnviados} · datos capturados: ${lista?.length ?? 0} · ventas HÉROE: ${ventasHeroe} · pedidos tienda: ${ventasTienda} · ingresos: $${ingresos.toLocaleString("es-MX")}`;

  // vía el canal único de avisos (manda WA + escribe el log)
  await fetch(`${req.nextUrl.origin}/api/avisos/roy-wa`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "reporte-embudo", texto }),
  });
  return NextResponse.json({ ok: true, texto });
}
