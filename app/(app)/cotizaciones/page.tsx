"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChannelBadge } from "@/components/ChannelBadge";
import type { QuoteRequest } from "@/types/database";

const CAMPOS: { key: keyof QuoteRequest; label: string }[] = [
  { key: "organizacion", label: "Empresa / Escuela" },
  { key: "num_personas", label: "Personas" },
  { key: "correo", label: "Correo" },
  { key: "telefono", label: "Teléfono" },
];

export default function CotizacionesPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"pendiente" | "atendida" | "todas">("pendiente");

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
            los junta aquí conforme los van dando.
          </p>
        </div>

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
            <div key={q.id} className="card p-4">
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
                  onClick={() => toggleStatus(q)}
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
    </div>
  );
}
