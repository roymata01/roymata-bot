import { createAdminClient } from "@/lib/supabase/admin";
import { firmaAprobacion } from "@/lib/cotizador/auto";
import BotonAprobar from "./BotonAprobar";

export const dynamic = "force-dynamic";

// Aprobación de un toque desde el WhatsApp de Roy: el link llega en la
// plantilla "cotizacion_lista_aprobar" (slug = <cotizacionId>-<firma HMAC>).
// Sin firma válida no se muestra nada. Al aprobar, la cotización se envía al
// cliente por correo (+ aviso de WhatsApp si dejó teléfono).
export default async function AprobarPage({ params }: { params: { slug: string } }) {
  const slug = params.slug || "";
  const idx = slug.lastIndexOf("-");
  const id = slug.slice(0, idx);
  const firma = slug.slice(idx + 1);

  const valida = id && firma && firma === firmaAprobacion(id);
  const supabase = createAdminClient();
  const { data: cot } = valida
    ? await supabase.from("cotizaciones_emitidas").select("*").eq("id", id).maybeSingle()
    : { data: null };

  let correoCliente: string | null = null;
  if (cot?.quote_request_id) {
    const { data: qr } = await supabase
      .from("quote_requests")
      .select("correo, nombre, organizacion")
      .eq("id", cot.quote_request_id)
      .maybeSingle();
    correoCliente = qr?.correo ?? null;
  }

  if (!valida || !cot) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef3fa", fontFamily: "Inter, sans-serif" }}>
        <p style={{ color: "#64748b" }}>Link inválido o vencido.</p>
      </div>
    );
  }

  const yaEnviada = (cot.enviada_por || []).length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#eef3fa", fontFamily: "Inter, sans-serif", padding: "16px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#1a56db", marginBottom: 4 }}>
          VITA RESCUE · Cotizador
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>
          Cotización S{cot.folio} — {cot.dirigida}
        </h1>
        <p style={{ color: "#475569", fontSize: 14, margin: "0 0 12px" }}>
          {cot.num_personas} personas · Total{" "}
          <strong>$ {Number(cot.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN</strong>
          {cot.descuento_pct > 0 ? ` · incluye ${cot.descuento_pct}% de descuento por grupo` : ""}
          {correoCliente ? ` · se enviará a ${correoCliente}` : ""}
        </p>
        <iframe
          src={cot.pdf_url}
          style={{ width: "100%", height: "58vh", border: "1px solid #dbe4f0", borderRadius: 12, background: "#fff" }}
          title="Cotización"
        />
        <BotonAprobar slug={slug} yaEnviada={yaEnviada} tieneCorreo={!!correoCliente} />
        <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 12 }}>
          Si algo no cuadra, no aproveches este botón: edítala o reenvíala desde tu panel de Cotizaciones.
        </p>
      </div>
    </div>
  );
}
