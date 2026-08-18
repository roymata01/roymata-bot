import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { htmlCotizacion, calcularTotales } from "@/lib/cotizaciones/plantilla";
import { htmlAPdfConPreview } from "@/lib/cotizaciones/pdf";

export const maxDuration = 120;

const FOLIO_INICIAL = 11027; // S11026 fue el ejemplo aprobado por Roy

// Genera el PDF de una cotización (estado borrador) y devuelve la URL para
// previsualizar. El envío es un paso aparte (/api/cotizaciones/enviar).
export async function POST(req: NextRequest) {
  // sesión del panel o llave de proceso automatizado (mismo patrón que tickets)
  const auth = req.headers.get("authorization");
  // Llaves de proceso: CRON_SECRET (interno) o la service key de Supabase —
  // esta última la comparte el admin de cursos.vitarescue.com.mx (server a server).
  const conLlave =
    (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY && auth === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
  if (!conLlave) {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { quote_request_id, dirigida, num_personas, precio_unitario, viaticos, instructor_roy, extra_descripcion, extra_monto } =
    await req.json().catch(() => ({}));

  const personas = Number(num_personas);
  const precio = Number(precio_unitario);
  const viat = Number(viaticos) || 0;
  if (!dirigida || !Number.isFinite(personas) || personas < 1 || !Number.isFinite(precio) || precio <= 0) {
    return NextResponse.json(
      { error: "Faltan datos: dirigida, num_personas y precio_unitario son obligatorios." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Folio consecutivo (S11027, S11028, ...)
  const { data: ultimo } = await supabase
    .from("cotizaciones_emitidas")
    .select("folio")
    .order("folio", { ascending: false })
    .limit(1)
    .maybeSingle();
  const folio = Math.max(FOLIO_INICIAL, (ultimo?.folio || 0) + 1);

  const conInstructor = Boolean(instructor_roy);
  const extraDesc = String(extra_descripcion || "").trim().slice(0, 160);
  const extraNum = Number(extra_monto) || 0;
  const { pct, total } = calcularTotales({
    numPersonas: personas,
    precioUnitario: precio,
    viaticos: viat,
    instructorRoy: conInstructor,
    extraMonto: extraDesc ? extraNum : 0,
  });

  const html = htmlCotizacion({
    folio,
    dirigida: String(dirigida).trim(),
    fecha: new Date(),
    numPersonas: personas,
    precioUnitario: precio,
    viaticos: viat,
    instructorRoy: conInstructor,
    extraDescripcion: extraDesc || undefined,
    extraMonto: extraDesc ? extraNum : 0,
  });

  let pdf: Buffer;
  let preview: Buffer | null = null;
  try {
    ({ pdf, preview } = await htmlAPdfConPreview(html));
  } catch (err) {
    console.error("Error generando PDF de cotización:", err);
    return NextResponse.json({ error: "No se pudo generar el PDF. Intenta de nuevo." }, { status: 500 });
  }

  const fileName = `S${folio}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("cotizaciones")
    .upload(fileName, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) {
    console.error("Error subiendo PDF:", upErr);
    return NextResponse.json({ error: "No se pudo guardar el PDF." }, { status: 500 });
  }
  const { data: urlData } = supabase.storage.from("cotizaciones").getPublicUrl(fileName);

  // Imagen de la hoja 1 (para la pantalla de aprobación en el celular)
  let previewUrl: string | null = null;
  if (preview) {
    const previewName = `S${folio}-hoja1.png`;
    const { error: pErr } = await supabase.storage
      .from("cotizaciones")
      .upload(previewName, preview, { contentType: "image/png", upsert: true });
    if (!pErr) previewUrl = supabase.storage.from("cotizaciones").getPublicUrl(previewName).data.publicUrl;
  }

  const { data: fila, error: dbErr } = await supabase
    .from("cotizaciones_emitidas")
    .insert({
      folio,
      quote_request_id: quote_request_id || null,
      dirigida: String(dirigida).trim(),
      num_personas: personas,
      precio_unitario: precio,
      viaticos: viat,
      descuento_pct: pct,
      total,
      pdf_url: urlData.publicUrl,
      preview_url: previewUrl,
    })
    .select("id, folio, pdf_url, total, descuento_pct")
    .single();
  if (dbErr) {
    console.error("Error guardando cotización:", dbErr);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cotizacion: fila });
}
