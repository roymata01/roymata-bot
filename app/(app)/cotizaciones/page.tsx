"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChannelBadge } from "@/components/ChannelBadge";
import type { QuoteRequest } from "@/types/database";

const CAMPOS: { key: keyof QuoteRequest; label: string }[] = [
  { key: "organizacion", label: "Empresa / Escuela" },
  { key: "num_personas", label: "Personas" },
  { key: "correo", label: "Correo" },
  { key: "telefono", label: "Teléfono" },
];

type Borrador = {
  id: string;
  folio: number;
  pdf_url: string;
  total: number;
  descuento_pct: number;
};

// Flujo: Generar cotización → formulario prellenado → previsualización del PDF
// → Roy aprueba y la envía por correo y/o por el mismo chat de la solicitud.
function Cotizador({ quote, onClose, onEnviada }: { quote: QuoteRequest | null; onClose: () => void; onEnviada: () => void }) {
  const [dirigida, setDirigida] = useState(quote?.organizacion || quote?.nombre || quote?.contact?.display_name || "");
  const [personas, setPersonas] = useState(quote?.num_personas ? String(quote.num_personas) : "");
  const [precio, setPrecio] = useState("850");
  const [viaticos, setViaticos] = useState("0");
  const [instructorRoy, setInstructorRoy] = useState(false);
  const [extraDesc, setExtraDesc] = useState("");
  const [extraMonto, setExtraMonto] = useState("");
  const [correo, setCorreo] = useState(quote?.correo || "");
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState<"correo" | "chat" | null>(null);
  const [enviadas, setEnviadas] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function generar() {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/cotizaciones/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_request_id: quote?.id || null,
          dirigida,
          num_personas: Number(personas),
          precio_unitario: Number(precio),
          viaticos: Number(viaticos) || 0,
          instructor_roy: instructorRoy,
          extra_descripcion: extraDesc,
          extra_monto: Number(extraMonto) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error generando");
      setBorrador(data.cotizacion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }

  async function enviar(via: "correo" | "chat") {
    if (!borrador) return;
    setEnviando(via);
    setError("");
    try {
      const res = await fetch("/api/cotizaciones/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cotizacion_id: borrador.id, via, correo: via === "correo" ? correo : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error enviando");
      setEnviadas((v) => [...v, via]);
      onEnviada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className="card mt-6 w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">
            {borrador ? `Previsualización — Cotización S${borrador.folio}` : "Generar cotización"}
          </h3>
          <button onClick={onClose} className="chip">Cerrar ✕</button>
        </div>

        {!borrador && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-[12px] text-[var(--text-3)]">
              Curso: <strong>Primeros auxilios básicos</strong> · el descuento por grupo (21+ personas) se aplica solo.
            </p>
            <div>
              <p className="label-xs">Dirigida a</p>
              <input value={dirigida} onChange={(e) => setDirigida(e.target.value)} className="input w-full" placeholder="Empresa o persona" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="label-xs">Personas</p>
                <input value={personas} onChange={(e) => setPersonas(e.target.value)} className="input w-full" type="number" min={1} />
              </div>
              <div>
                <p className="label-xs">Precio por persona (MXN)</p>
                <input value={precio} onChange={(e) => setPrecio(e.target.value)} className="input w-full" type="number" min={1} />
              </div>
              <div>
                <p className="label-xs">Viáticos (0 = sin viáticos)</p>
                <input value={viaticos} onChange={(e) => setViaticos(e.target.value)} className="input w-full" type="number" min={0} />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input type="checkbox" checked={instructorRoy} onChange={(e) => setInstructorRoy(e.target.checked)} />
              Instructor: TUM I. Rodrigo Mata (Roy) — se agregan <strong>$5,000</strong> a la cotización
            </label>

            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div>
                <p className="label-xs">Especificación extra (opcional)</p>
                <input value={extraDesc} onChange={(e) => setExtraDesc(e.target.value)} className="input w-full" placeholder="Ej. Maniquíes adicionales, curso en fin de semana..." />
              </div>
              <div>
                <p className="label-xs">Monto extra</p>
                <input value={extraMonto} onChange={(e) => setExtraMonto(e.target.value)} className="input w-full" type="number" min={0} placeholder="0" />
              </div>
            </div>

            {error && <p className="text-[13px] text-[#e5484d]">{error}</p>}
            <button
              onClick={generar}
              disabled={cargando || !dirigida.trim() || !Number(personas) || !Number(precio)}
              className="btn w-full justify-center disabled:opacity-50"
            >
              {cargando ? "Generando PDF…" : "Generar previsualización"}
            </button>
          </div>
        )}

        {borrador && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-[13px] text-[var(--text-2)]">
              Total: <strong>$ {borrador.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN</strong>
              {borrador.descuento_pct > 0 && ` (incluye ${borrador.descuento_pct}% de descuento por grupo)`}
            </p>
            <iframe src={borrador.pdf_url} className="h-[420px] w-full rounded-lg border border-[var(--border)] bg-white" title="Previsualización" />
            <a href={borrador.pdf_url} target="_blank" className="text-[12px] text-[var(--accent)] underline">
              Abrir el PDF en otra pestaña ↗
            </a>

            <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
              <div className="flex items-center gap-2">
                <input
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="input flex-1"
                  placeholder="correo@delcliente.com"
                  type="email"
                />
                <button
                  onClick={() => enviar("correo")}
                  disabled={!!enviando || !correo.trim() || enviadas.includes("correo")}
                  className="btn shrink-0 disabled:opacity-50"
                >
                  {enviadas.includes("correo") ? "✓ Enviada por correo" : enviando === "correo" ? "Enviando…" : "📧 Enviar por correo"}
                </button>
              </div>
              <button
                onClick={() => enviar("chat")}
                disabled={!!enviando || enviadas.includes("chat") || !quote?.conversation_id}
                className="btn w-full justify-center disabled:opacity-50"
              >
                {!quote?.conversation_id
                  ? "💬 Sin chat de origen (cotización manual)"
                  : enviadas.includes("chat")
                    ? "✓ Enviada por el chat"
                    : enviando === "chat"
                      ? "Enviando…"
                      : "💬 Enviar por el chat de la solicitud"}
              </button>
              {error && <p className="text-[13px] text-[#e5484d]">{error}</p>}
              {enviadas.length > 0 && (
                <p className="text-[12px] text-[#46b380]">
                  Enviada ✓ — la solicitud quedó marcada como atendida.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CotizacionesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"pendiente" | "atendida" | "todas">("pendiente");
  const [cotizando, setCotizando] = useState<QuoteRequest | null>(null);
  const [manualAbierta, setManualAbierta] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("quote_requests")
      .select("*, contact:contacts(*)")
      .order("created_at", { ascending: false });
    setQuotes((data as QuoteRequest[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla
    load();
  }, [load]);

  async function toggleStatus(q: QuoteRequest) {
    const next = q.status === "pendiente" ? "atendida" : "pendiente";
    await supabase.from("quote_requests").update({ status: next }).eq("id", q.id);
    setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: next } : x)));
  }

  const visibles = quotes.filter((q) => filtro === "todas" || q.status === filtro);
  const pendientes = quotes.filter((q) => q.status === "pendiente").length;

  if (loading) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <h2 className="page-title">Cotizaciones</h2>
          <p className="page-sub">
            Personas que pidieron un curso para su empresa, escuela o grupo. El bot les pide sus datos y la IA
            los junta aquí conforme los van dando. Con &quot;Generar cotización&quot; sale el PDF oficial para
            aprobar y enviar.
          </p>
        </div>

        <button onClick={() => setManualAbierta(true)} className="btn w-fit">
          ➕ Generar cotización manual
        </button>

        <div className="flex gap-2">
          {(["pendiente", "atendida", "todas"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`chip ${filtro === f ? "!border-[var(--accent)]/40 !text-[var(--text-1)]" : ""}`}
            >
              {f === "pendiente" ? `Pendientes (${pendientes})` : f === "atendida" ? "Atendidas" : "Todas"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {visibles.map((q) => (
            <div
              key={q.id}
              onClick={() => router.push(`/inbox?c=${q.conversation_id}`)}
              className="card cursor-pointer p-4 transition hover:border-[var(--border-strong)]"
              title="Ver conversación"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold">
                      {q.nombre || q.contact?.display_name || "Sin nombre"}
                    </p>
                    {q.contact && <ChannelBadge channel={q.contact.channel} />}
                  </div>
                  <p className="text-[11px] text-[var(--text-3)]">
                    {q.contact?.display_name ? `${q.contact.display_name} · ` : ""}
                    {new Date(q.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStatus(q);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                    q.status === "pendiente"
                      ? "border-[#f0b429]/25 bg-[#f0b429]/10 text-[#f0b429]"
                      : "border-[#46b380]/25 bg-[#46b380]/10 text-[#46b380]"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${q.status === "pendiente" ? "bg-[#f0b429]" : "bg-[#46b380]"}`} />
                  {q.status === "pendiente" ? "Pendiente" : "Atendida"}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                {CAMPOS.map(({ key, label }) => (
                  <div key={key}>
                    <p className="label-xs">{label}</p>
                    <p className="text-[13px]">{(q[key] as string | number | null) ?? <span className="text-[var(--text-3)]">—</span>}</p>
                  </div>
                ))}
              </div>

              {q.notas && <p className="mt-3 text-[13px] text-[var(--text-2)]">{q.notas}</p>}

              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCotizando(q);
                  }}
                  className="btn"
                >
                  📋 Generar cotización
                </button>
              </div>
            </div>
          ))}
          {visibles.length === 0 && (
            <p className="text-[13px] text-[var(--text-3)]">
              {filtro === "pendiente"
                ? "No hay cotizaciones pendientes. Cuando alguien pida un curso para su empresa o escuela, aparecerá aquí."
                : "Nada por aquí todavía."}
            </p>
          )}
        </div>
      </div>

      {manualAbierta && (
        <Cotizador quote={null} onClose={() => setManualAbierta(false)} onEnviada={() => {}} />
      )}

      {cotizando && (
        <Cotizador
          quote={cotizando}
          onClose={() => setCotizando(null)}
          onEnviada={() => {
            setQuotes((prev) => prev.map((x) => (x.id === cotizando?.id ? { ...x, status: "atendida" } : x)));
          }}
        />
      )}
    </div>
  );
}
