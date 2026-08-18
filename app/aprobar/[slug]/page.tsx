import { createAdminClient } from "@/lib/supabase/admin";
import { firmaAprobacion } from "@/lib/cotizador/auto";
import BotonAprobar from "./BotonAprobar";

export const dynamic = "force-dynamic";

// Aprobación de un toque desde el WhatsApp de Roy: el link llega en la
// plantilla "cotizacion_lista_aprobar" (slug = <cotizacionId>-<firma HMAC>).
// Sin firma válida no se muestra nada. Al aprobar, la cotización se envía al
// cliente por correo (+ aviso de WhatsApp si dejó teléfono).
// En esta versión de Next los params llegan como promesa (hay que await).
export default async function AprobarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: slugParam } = await params;
  const slug = slugParam || "";
  const idx = slug.lastIndexOf("-");
  const id = slug.slice(0, idx);
  const firma = slug.slice(idx + 1);

  const valida = id && firma && firma === firmaAprobacion(id);
  const supabase = createAdminClient();
  const { data: cot } = valida
    ? await supabase.from("cotizaciones_emitidas").select("*").eq("id", id).maybeSingle()
    : { data: null };

  let correoCliente: string | null = null;
  let solicitud: {
    nombre: string | null;
    organizacion: string | null;
    num_personas: number | null;
    correo: string | null;
    telefono: string | null;
    notas: string | null;
  } | null = null;
  if (cot?.quote_request_id) {
    const { data: qr } = await supabase
      .from("quote_requests")
      .select("correo, nombre, organizacion, num_personas, telefono, notas")
      .eq("id", cot.quote_request_id)
      .maybeSingle();
    correoCliente = qr?.correo ?? null;
    solicitud = qr ?? null;
  }

  // Lo que pidió el cliente, en campos sueltos para comparar de un vistazo
  const notas = solicitud?.notas || "";
  const pedido = {
    lugar: notas.match(/Lugar:\s*([^·]+)/)?.[1]?.trim() || "—",
    curso: notas.match(/Curso:\s*([^·]+)/)?.[1]?.trim() || "—",
    instructorRoy: /Instructor Roy:\s*S[ÍI]/i.test(notas),
    comentarios: notas.match(/Comentarios:\s*(.+)$/)?.[1]?.trim() || "",
  };

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

        {/* Lo que pidió el cliente, para comparar contra la cotización armada */}
        {solicitud && (
          <div style={{ background: "#fff", border: "1px solid #dbe4f0", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", margin: "0 0 8px" }}>
              Lo que pidió el cliente
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {[
                ["Quién", `${solicitud.nombre || "—"}${solicitud.organizacion ? ` · ${solicitud.organizacion}` : ""}`],
                ["Personas", solicitud.num_personas ? String(solicitud.num_personas) : "—"],
                ["Lugar", pedido.lugar],
                ["Curso", pedido.curso],
                ["Instructor Roy", pedido.instructorRoy ? "SÍ (+$5,000)" : "no"],
                ["Contacto", [solicitud.correo, solicitud.telefono].filter(Boolean).join(" · ") || "—"],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <p style={{ fontSize: 10, color: "#94a3b8", margin: 0, textTransform: "uppercase", fontWeight: 700 }}>{etiqueta}</p>
                  <p style={{ fontSize: 13, color: "#0f172a", margin: "1px 0 0", lineHeight: 1.35 }}>{valor}</p>
                </div>
              ))}
            </div>
            {pedido.comentarios && (
              <p style={{ fontSize: 13, color: "#0f172a", margin: "10px 0 0", background: "#fef9c3", borderRadius: 8, padding: "8px 10px" }}>
                💬 {pedido.comentarios}
              </p>
            )}
          </div>
        )}

        {/* Hoja 1 como IMAGEN: se ve completa en el celular de un vistazo
            (los visores de PDF embebidos salen en negro en móvil). */}
        {cot.preview_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cot.preview_url}
            alt={`Cotización S${cot.folio}, hoja 1`}
            style={{ width: "100%", display: "block", border: "1px solid #dbe4f0", borderRadius: 12, background: "#fff" }}
          />
        ) : (
          <div style={{ position: "relative", width: "100%", aspectRatio: "8.5 / 11", border: "1px solid #dbe4f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            <iframe
              src={`${cot.pdf_url}#page=1&view=Fit&toolbar=0&navpanes=0`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
              title="Cotización"
            />
          </div>
        )}
        <a
          href={cot.pdf_url}
          target="_blank"
          rel="noreferrer"
          style={{ display: "inline-block", marginTop: 8, fontSize: 13, color: "#1a56db", fontWeight: 600 }}
        >
          Abrir el PDF completo (2 páginas) ↗
        </a>
        <BotonAprobar slug={slug} yaEnviada={yaEnviada} tieneCorreo={!!correoCliente} />
        <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 12 }}>
          Si algo no cuadra, no aproveches este botón: edítala o reenvíala desde tu panel de Cotizaciones.
        </p>
      </div>
    </div>
  );
}
