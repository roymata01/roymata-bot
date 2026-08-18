import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmaAprobacion } from "@/lib/cotizador/auto";

export const maxDuration = 60;

// El botón "Aprobar y enviar" de /aprobar/<slug>: valida la firma y dispara el
// envío real (correo con PDF + aviso WhatsApp al cliente) vía el pipeline de
// siempre. La autorización ES la firma HMAC del link que solo Roy recibió.
export async function POST(req: NextRequest) {
  const { slug } = await req.json().catch(() => ({}));
  const idx = String(slug || "").lastIndexOf("-");
  const id = String(slug || "").slice(0, idx);
  const firma = String(slug || "").slice(idx + 1);
  if (!id || firma !== firmaAprobacion(id)) {
    return NextResponse.json({ error: "Link inválido." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: cot } = await supabase
    .from("cotizaciones_emitidas")
    .select("id, quote_request_id, enviada_por")
    .eq("id", id)
    .maybeSingle();
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
  if ((cot.enviada_por || []).length > 0) return NextResponse.json({ ok: true, nota: "ya estaba enviada" });

  const { data: qr } = cot.quote_request_id
    ? await supabase.from("quote_requests").select("correo").eq("id", cot.quote_request_id).maybeSingle()
    : { data: null };
  if (!qr?.correo) return NextResponse.json({ error: "La solicitud no tiene correo." }, { status: 400 });

  const res = await fetch("https://sistema.vitarescue.com.mx/api/cotizaciones/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ cotizacion_id: id, via: "correo", correo: qr.correo }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: data.error || "No se pudo enviar." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
