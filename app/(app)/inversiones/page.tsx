"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// Dashboard de inversiones personales de Roy (portafolio GBM).
// Fuente de verdad: esta base. El Google Sheets se sincroniza con un clic
// (o al abrir la página) y los precios los actualiza Roy a mano.
// Colores de series validados con el método dataviz: azul #1a56db (valor),
// ámbar #b45309 (invertido); verde/rojo solo para ganancia/pérdida, siempre
// acompañados del signo y la dirección de la barra (no color solo).

type Posicion = {
  id: string;
  clave: string;
  cantidad: number;
  costo_promedio: number;
  precio_actual: number;
  objetivo: string | null;
  updated_at: string;
};

type Snapshot = { fecha: string; invertido: number; valor: number };

const AZUL = "#1a56db";
const AMBAR = "#b45309";
const VERDE = "#16a34a";
const ROJO = "#e5484d";

const mxn = (n: number, dec = 0) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function derivados(p: Posicion) {
  const invertido = p.cantidad * p.costo_promedio;
  const valor = p.cantidad * p.precio_actual;
  const ganancia = valor - invertido;
  const rendimiento = invertido > 0 ? (ganancia / invertido) * 100 : 0;
  return { invertido, valor, ganancia, rendimiento };
}

type Borrador = {
  clave: string;
  cantidad: string;
  costo_promedio: string;
  precio_actual: string;
  objetivo: string;
};

export default function InversionesPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [posiciones, setPosiciones] = useState<Posicion[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [fechaInicio, setFechaInicio] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<"idle" | "corriendo">("idle");
  const [msg, setMsg] = useState("");
  const [editando, setEditando] = useState<string | "nueva" | null>(null);
  const [borrador, setBorrador] = useState<Borrador>({ clave: "", cantidad: "", costo_promedio: "", precio_actual: "", objetivo: "" });
  const [configAbierta, setConfigAbierta] = useState(false);

  const load = useCallback(async () => {
    const [{ data: pos }, { data: snaps }, { data: config }] = await Promise.all([
      supabase.from("inversiones").select("*").order("clave"),
      supabase.from("inversiones_snapshots").select("*").order("fecha"),
      supabase.from("inversiones_config").select("*").eq("id", 1).maybeSingle(),
    ]);
    setPosiciones((pos as Posicion[]) ?? []);
    setSnapshots((snaps as Snapshot[]) ?? []);
    if (config) {
      setSheetUrl(config.sheet_url || "");
      setFechaInicio(config.fecha_inicio);
    }
    setLoading(false);
  }, [supabase]);

  const sincronizar = useCallback(
    async (silencioso = false) => {
      setSync("corriendo");
      if (!silencioso) setMsg("");
      try {
        const res = await fetch("/api/inversiones/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        if (!silencioso) setMsg(`Sincronizado ✓ — ${data.actualizadas} posiciones actualizadas desde tu Sheets.`);
        load();
      } catch (e) {
        if (!silencioso) setMsg(e instanceof Error ? e.message : "Error sincronizando");
      } finally {
        setSync("idle");
      }
    },
    [load]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    load().then(() => {
      // auto-sync silencioso al abrir, para que el Sheets recién editado se refleje
      sincronizar(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardarConfig() {
    await supabase.from("inversiones_config").upsert({ id: 1, sheet_url: sheetUrl.trim() || null, fecha_inicio: fechaInicio });
    setMsg("Link del Sheets guardado.");
  }

  function abrirEdicion(p: Posicion | null) {
    if (p) {
      setEditando(p.id);
      setBorrador({
        clave: p.clave,
        cantidad: String(p.cantidad),
        costo_promedio: String(p.costo_promedio),
        precio_actual: String(p.precio_actual),
        objetivo: p.objetivo || "",
      });
    } else {
      setEditando("nueva");
      setBorrador({ clave: "", cantidad: "", costo_promedio: "", precio_actual: "", objetivo: "" });
    }
  }

  async function guardarPosicion() {
    const fila = {
      clave: borrador.clave.trim().toUpperCase(),
      cantidad: Number(borrador.cantidad) || 0,
      costo_promedio: Number(borrador.costo_promedio) || 0,
      precio_actual: Number(borrador.precio_actual) || 0,
      objetivo: borrador.objetivo.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!fila.clave) return;
    const { error } = await supabase.from("inversiones").upsert(fila, { onConflict: "clave" });
    if (error) { setMsg(error.message); return; }
    setEditando(null);
    await load();
    fetch("/api/inversiones/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot_only: true }),
    }).catch(() => {});
  }

  async function eliminar(p: Posicion) {
    if (!confirm(`¿Eliminar ${p.clave} del portafolio?`)) return;
    await supabase.from("inversiones").delete().eq("id", p.id);
    load();
  }

  const totales = useMemo(() => {
    let invertido = 0, valor = 0;
    for (const p of posiciones) {
      const d = derivados(p);
      invertido += d.invertido;
      valor += d.valor;
    }
    const ganancia = valor - invertido;
    return { invertido, valor, ganancia, rendimiento: invertido > 0 ? (ganancia / invertido) * 100 : 0 };
  }, [posiciones]);

  const porValor = useMemo(
    () => [...posiciones].map((p) => ({ p, ...derivados(p) })).sort((a, b) => b.valor - a.valor),
    [posiciones]
  );
  const porRendimiento = useMemo(
    () => [...posiciones].map((p) => ({ p, ...derivados(p) })).sort((a, b) => b.rendimiento - a.rendimiento),
    [posiciones]
  );
  const maxValor = Math.max(...porValor.map((x) => x.valor), 1);
  const maxAbsRend = Math.max(...porRendimiento.map((x) => Math.abs(x.rendimiento)), 1);

  if (loading) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="page-title">Inversiones personales</h2>
            <p className="page-sub">
              Tu portafolio GBM{fechaInicio ? ` · desde el ${new Date(fechaInicio + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}` : ""}.
              Actualiza precios en tu Google Sheets o directo aquí.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => sincronizar()} disabled={sync === "corriendo"} className="btn disabled:opacity-50">
              {sync === "corriendo" ? "Sincronizando…" : "🔄 Sincronizar Sheets"}
            </button>
            <button onClick={() => setConfigAbierta(!configAbierta)} className="chip">⚙️</button>
          </div>
        </div>

        {configAbierta && (
          <div className="card flex flex-col gap-2 p-4">
            <p className="label-xs">Link de tu Google Sheets (compartido como &quot;cualquiera con el link puede ver&quot;)</p>
            <div className="flex gap-2">
              <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} className="input flex-1" placeholder="https://docs.google.com/spreadsheets/d/..." />
              <button onClick={guardarConfig} className="btn shrink-0">Guardar</button>
            </div>
          </div>
        )}

        {msg && <p className="text-[13px] text-[var(--text-2)]">{msg}</p>}

        {/* Tarjetas de totales */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4">
            <p className="label-xs">Total invertido</p>
            <p className="num mt-1 text-[22px] font-bold">{mxn(totales.invertido)}</p>
          </div>
          <div className="card p-4">
            <p className="label-xs">Valor actual</p>
            <p className="num mt-1 text-[22px] font-bold" style={{ color: AZUL }}>{mxn(totales.valor)}</p>
          </div>
          <div className="card p-4">
            <p className="label-xs">{totales.ganancia >= 0 ? "Ganancia" : "Pérdida"}</p>
            <p className="num mt-1 text-[22px] font-bold" style={{ color: totales.ganancia >= 0 ? VERDE : ROJO }}>
              {totales.ganancia >= 0 ? "+" : "−"}{mxn(Math.abs(totales.ganancia))}
            </p>
            <p className="text-[12px] font-semibold" style={{ color: totales.ganancia >= 0 ? VERDE : ROJO }}>
              {pct(totales.rendimiento)}
            </p>
          </div>
          <div className="card p-4">
            <p className="label-xs">Posiciones</p>
            <p className="num mt-1 text-[22px] font-bold">{posiciones.length}</p>
          </div>
        </div>

        {/* Distribución del portafolio — barras horizontales, un solo tono */}
        <div className="card p-5">
          <h3 className="text-[14px] font-semibold">¿Dónde está tu dinero?</h3>
          <p className="text-[12px] text-[var(--text-3)]">Valor actual por acción · el porcentaje es su peso en el portafolio</p>
          <div className="mt-4 flex flex-col gap-2">
            {porValor.map(({ p, valor }) => (
              <div key={p.id} className="group flex items-center gap-3" title={`${p.clave}: ${mxn(valor, 2)} (${((valor / (totales.valor || 1)) * 100).toFixed(1)}% del portafolio)`}>
                <span className="num w-14 shrink-0 text-[12px] font-bold">{p.clave}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-r-[4px] bg-[var(--bg)]">
                  <div
                    className="h-full rounded-r-[4px] transition-all group-hover:opacity-80"
                    style={{ width: `${(valor / maxValor) * 100}%`, background: AZUL }}
                  />
                </div>
                <span className="num w-24 shrink-0 text-right text-[12px]">{mxn(valor)}</span>
                <span className="num w-12 shrink-0 text-right text-[11px] text-[var(--text-3)]">
                  {((valor / (totales.valor || 1)) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Rendimiento por acción — barras divergentes desde cero */}
        <div className="card p-5">
          <h3 className="text-[14px] font-semibold">Rendimiento por acción</h3>
          <p className="text-[12px] text-[var(--text-3)]">
            A la derecha del eje ganan, a la izquierda pierden · % sobre lo invertido en cada una
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {porRendimiento.map(({ p, rendimiento, ganancia }) => (
              <div key={p.id} className="group flex items-center gap-3" title={`${p.clave}: ${pct(rendimiento)} (${ganancia >= 0 ? "+" : "−"}${mxn(Math.abs(ganancia), 2)})`}>
                <span className="num w-14 shrink-0 text-[12px] font-bold">{p.clave}</span>
                <div className="relative h-5 flex-1">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-strong)]" />
                  {rendimiento >= 0 ? (
                    <div
                      className="absolute inset-y-0 left-1/2 rounded-r-[4px] transition-all group-hover:opacity-80"
                      style={{ width: `${(rendimiento / maxAbsRend) * 50}%`, background: VERDE }}
                    />
                  ) : (
                    <div
                      className="absolute inset-y-0 rounded-l-[4px] transition-all group-hover:opacity-80"
                      style={{ right: "50%", width: `${(Math.abs(rendimiento) / maxAbsRend) * 50}%`, background: ROJO }}
                    />
                  )}
                </div>
                <span className="num w-16 shrink-0 text-right text-[12px] font-semibold" style={{ color: rendimiento >= 0 ? VERDE : ROJO }}>
                  {pct(rendimiento)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Evolución — se construye con un snapshot diario */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold">Evolución del portafolio</h3>
              <p className="text-[12px] text-[var(--text-3)]">Un punto por día · se va construyendo desde hoy</p>
            </div>
            <div className="flex gap-4 text-[12px]">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AZUL }} /> Valor</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AMBAR }} /> Invertido</span>
            </div>
          </div>
          {snapshots.length < 2 ? (
            <p className="mt-4 rounded-lg bg-[var(--bg)] px-4 py-6 text-center text-[13px] text-[var(--text-3)]">
              La gráfica aparece a partir del segundo día — cada vez que entras o sincronizas se guarda el punto del día.
            </p>
          ) : (
            <EvolucionChart snapshots={snapshots} />
          )}
        </div>

        {/* Tabla editable */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold">Posiciones</h3>
            <button onClick={() => abrirEdicion(null)} className="btn">➕ Agregar</button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-3)]">
                  <th className="py-2 pr-3">Clave</th>
                  <th className="py-2 pr-3 text-right">Cantidad</th>
                  <th className="py-2 pr-3 text-right">Costo prom.</th>
                  <th className="py-2 pr-3 text-right">Precio actual</th>
                  <th className="py-2 pr-3 text-right">Invertido</th>
                  <th className="py-2 pr-3 text-right">Valor</th>
                  <th className="py-2 pr-3 text-right">Ganancia</th>
                  <th className="py-2 pr-3">Objetivo</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {porValor.map(({ p, invertido, valor, ganancia, rendimiento }) => (
                  <tr key={p.id} className="border-t border-[var(--border)]">
                    <td className="num py-2.5 pr-3 font-bold">{p.clave}</td>
                    <td className="num py-2.5 pr-3 text-right">{p.cantidad}</td>
                    <td className="num py-2.5 pr-3 text-right">{mxn(p.costo_promedio, 2)}</td>
                    <td className="num py-2.5 pr-3 text-right">{mxn(p.precio_actual, 2)}</td>
                    <td className="num py-2.5 pr-3 text-right">{mxn(invertido)}</td>
                    <td className="num py-2.5 pr-3 text-right">{mxn(valor)}</td>
                    <td className="num py-2.5 pr-3 text-right font-semibold" style={{ color: ganancia >= 0 ? VERDE : ROJO }}>
                      {ganancia >= 0 ? "+" : "−"}{mxn(Math.abs(ganancia))} <span className="text-[11px]">({pct(rendimiento)})</span>
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-[var(--text-2)]">{p.objetivo || "—"}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => abrirEdicion(p)} className="text-[12px] font-semibold text-[var(--accent)] hover:underline">Editar</button>
                      <button onClick={() => eliminar(p)} className="ml-3 text-[12px] text-[var(--text-3)] hover:text-[#e5484d]">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Editor */}
        {editando !== null && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setEditando(null)}>
            <div className="card mt-10 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[15px] font-semibold">{editando === "nueva" ? "Agregar posición" : `Editar ${borrador.clave}`}</h3>
              <div className="mt-4 flex flex-col gap-3">
                <div>
                  <p className="label-xs">Clave (ticker)</p>
                  <input value={borrador.clave} onChange={(e) => setBorrador({ ...borrador, clave: e.target.value })} className="input w-full" placeholder="Ej. NVDA" disabled={editando !== "nueva"} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="label-xs">Cantidad</p>
                    <input value={borrador.cantidad} onChange={(e) => setBorrador({ ...borrador, cantidad: e.target.value })} className="input w-full" type="number" step="any" />
                  </div>
                  <div>
                    <p className="label-xs">Costo promedio</p>
                    <input value={borrador.costo_promedio} onChange={(e) => setBorrador({ ...borrador, costo_promedio: e.target.value })} className="input w-full" type="number" step="any" />
                  </div>
                  <div>
                    <p className="label-xs">Precio actual</p>
                    <input value={borrador.precio_actual} onChange={(e) => setBorrador({ ...borrador, precio_actual: e.target.value })} className="input w-full" type="number" step="any" />
                  </div>
                </div>
                <div>
                  <p className="label-xs">Objetivo (opcional)</p>
                  <input value={borrador.objetivo} onChange={(e) => setBorrador({ ...borrador, objetivo: e.target.value })} className="input w-full" placeholder="AUMENTAR, 25%..." />
                </div>
                <div className="flex gap-2">
                  <button onClick={guardarPosicion} className="btn flex-1 justify-center">Guardar</button>
                  <button onClick={() => setEditando(null)} className="chip">Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Línea de evolución en SVG puro: 2 series (valor azul, invertido ámbar),
// puntos con tooltip nativo, ejes recesivos.
function EvolucionChart({ snapshots }: { snapshots: Snapshot[] }) {
  const W = 720, H = 220, PAD = { t: 12, r: 16, b: 26, l: 56 };
  const xs = snapshots.map((s) => new Date(s.fecha + "T12:00:00").getTime());
  const todos = snapshots.flatMap((s) => [Number(s.invertido), Number(s.valor)]);
  const yMin = Math.min(...todos) * 0.98;
  const yMax = Math.max(...todos) * 1.02;
  const x = (t: number) => PAD.l + ((t - xs[0]) / Math.max(xs[xs.length - 1] - xs[0], 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / Math.max(yMax - yMin, 1)) * (H - PAD.t - PAD.b);
  const linea = (serie: (s: Snapshot) => number) =>
    snapshots.map((s, i) => `${i === 0 ? "M" : "L"}${x(xs[i]).toFixed(1)},${y(serie(s)).toFixed(1)}`).join(" ");
  const fmtCorto = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}k`);
  const ticksY = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full">
      {ticksY.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
          <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-3)">{fmtCorto(v)}</text>
        </g>
      ))}
      <path d={linea((s) => Number(s.invertido))} fill="none" stroke={AMBAR} strokeWidth="2" />
      <path d={linea((s) => Number(s.valor))} fill="none" stroke={AZUL} strokeWidth="2" />
      {snapshots.map((s, i) => (
        <g key={s.fecha}>
          <circle cx={x(xs[i])} cy={y(Number(s.valor))} r="4" fill={AZUL} stroke="var(--surface)" strokeWidth="2">
            <title>{`${s.fecha} · Valor: $${Number(s.valor).toLocaleString("es-MX")}`}</title>
          </circle>
          <circle cx={x(xs[i])} cy={y(Number(s.invertido))} r="4" fill={AMBAR} stroke="var(--surface)" strokeWidth="2">
            <title>{`${s.fecha} · Invertido: $${Number(s.invertido).toLocaleString("es-MX")}`}</title>
          </circle>
          {(i === 0 || i === snapshots.length - 1) && (
            <text x={x(xs[i])} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-3)">
              {new Date(s.fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
