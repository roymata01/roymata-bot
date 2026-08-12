"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// Dashboard de inversiones personales de Roy — tema DARK propio de esta página
// (el resto del panel sigue claro). Paleta categórica de la dona validada con
// el método dataviz en modo dark (7 tonos + gris neutral para "Otras", con
// separación de 2px y etiquetas directas como codificación secundaria).

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

const PALETA = ["#4C7DF0", "#B45309", "#2BA875", "#8B6FE8", "#E5484D", "#0FA5C0", "#D6336C"];
const GRIS_OTRAS = "#64748B";
const AZUL = "#4C7DF0";
const AMBAR = "#D9A23D";
const VERDE = "#2BD48A";
const ROJO = "#FF6B6B";
const SURFACE = "#131E33";

const DARK_VARS = {
  "--bg": "#0B1220",
  "--surface": SURFACE,
  "--surface-2": "#182642",
  "--border": "rgba(122,162,247,0.14)",
  "--border-strong": "rgba(122,162,247,0.32)",
  "--text": "#E7EDF7",
  "--text-2": "#A9B7D0",
  "--text-3": "#7286A5",
  "--accent": "#3D7BFD",
  "--accent-hover": "#2F66E0",
  "--accent-soft": "rgba(61,123,253,0.16)",
} as React.CSSProperties;

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
  const [seleccion, setSeleccion] = useState<string | null>(null); // clave u "OTRAS"
  const [diaSel, setDiaSel] = useState<Snapshot | null>(null);

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
    if (seleccion === p.clave) setSeleccion(null);
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
  const maxAbsRend = Math.max(...porRendimiento.map((x) => Math.abs(x.rendimiento)), 1);

  // Dona: top 7 con color fijo + "Otras" agrupadas en gris neutral
  const rebanadas = useMemo(() => {
    const top = porValor.slice(0, 7).map((x, i) => ({
      clave: x.p.clave,
      valor: x.valor,
      color: PALETA[i],
    }));
    const resto = porValor.slice(7);
    if (resto.length) {
      top.push({ clave: "OTRAS", valor: resto.reduce((s, x) => s + x.valor, 0), color: GRIS_OTRAS });
    }
    return top;
  }, [porValor]);

  const colorDe = useCallback(
    (clave: string) => rebanadas.find((r) => r.clave === clave)?.color || GRIS_OTRAS,
    [rebanadas]
  );

  const detalle = useMemo(() => {
    if (!seleccion || seleccion === "OTRAS") return null;
    const x = porValor.find((v) => v.p.clave === seleccion);
    if (!x) return null;
    return { ...x, peso: totales.valor > 0 ? (x.valor / totales.valor) * 100 : 0 };
  }, [seleccion, porValor, totales.valor]);

  const otrasLista = useMemo(() => porValor.slice(7), [porValor]);

  if (loading)
    return (
      <div className="h-full overflow-y-auto p-6" style={{ ...DARK_VARS, background: "#0B1220" }}>
        <p className="text-[13px] text-[var(--text-3)]">Cargando...</p>
      </div>
    );

  return (
    <div className="h-full overflow-y-auto p-6" style={{ ...DARK_VARS, background: "#0B1220" }}>
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-[var(--text)]">Inversiones personales</h2>
            <p className="text-[13px] text-[var(--text-3)]">
              Tu portafolio GBM{fechaInicio ? ` · desde el ${new Date(fechaInicio + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}` : ""} · toca cualquier gráfica para ver el detalle
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

        {/* Totales con glow */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4" style={{ boxShadow: "0 0 28px rgba(76,125,240,0.10)" }}>
            <p className="label-xs">Total invertido</p>
            <p className="num mt-1 text-[22px] font-bold text-[var(--text)]">{mxn(totales.invertido)}</p>
          </div>
          <div className="card p-4" style={{ boxShadow: "0 0 28px rgba(76,125,240,0.18)" }}>
            <p className="label-xs">Valor actual</p>
            <p className="num mt-1 text-[22px] font-bold" style={{ color: AZUL }}>{mxn(totales.valor)}</p>
          </div>
          <div className="card p-4" style={{ boxShadow: `0 0 28px ${totales.ganancia >= 0 ? "rgba(43,212,138,0.14)" : "rgba(255,107,107,0.14)"}` }}>
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
            <p className="num mt-1 text-[22px] font-bold text-[var(--text)]">{posiciones.length}</p>
          </div>
        </div>

        {/* Dona clickeable + leyenda + detalle */}
        <div className="card p-5">
          <h3 className="text-[14px] font-semibold text-[var(--text)]">¿Dónde está tu dinero?</h3>
          <p className="text-[12px] text-[var(--text-3)]">Toca una rebanada o su nombre para ver el detalle completo</p>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
            <Dona
              rebanadas={rebanadas}
              total={totales.valor}
              seleccion={seleccion}
              onSeleccion={(c) => setSeleccion(seleccion === c ? null : c)}
            />
            <div className="flex flex-1 flex-col gap-1.5">
              {rebanadas.map((r) => (
                <button
                  key={r.clave}
                  onClick={() => setSeleccion(seleccion === r.clave ? null : r.clave)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition ${seleccion === r.clave ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"}`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="num w-16 text-[13px] font-bold text-[var(--text)]">{r.clave === "OTRAS" ? "Otras" : r.clave}</span>
                  <span className="num flex-1 text-right text-[12px] text-[var(--text-2)]">{mxn(r.valor)}</span>
                  <span className="num w-12 text-right text-[11px] text-[var(--text-3)]">
                    {((r.valor / (totales.valor || 1)) * 100).toFixed(1)}%
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Detalle de la selección */}
          {detalle && (
            <div className="mt-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-3.5 rounded-full" style={{ background: colorDe(detalle.p.clave) }} />
                  <span className="num text-[18px] font-bold text-[var(--text)]">{detalle.p.clave}</span>
                  {detalle.p.objetivo && (
                    <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[11px] text-[var(--text-2)]">
                      Objetivo: {detalle.p.objetivo}
                    </span>
                  )}
                </div>
                <button onClick={() => abrirEdicion(detalle.p)} className="text-[12px] font-semibold text-[var(--accent)] hover:underline">
                  Editar posición
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                {[
                  ["Títulos", String(detalle.p.cantidad)],
                  ["Costo promedio", mxn(detalle.p.costo_promedio, 2)],
                  ["Precio actual", mxn(detalle.p.precio_actual, 2)],
                  ["Peso en portafolio", `${detalle.peso.toFixed(1)}%`],
                  ["Invertido", mxn(detalle.invertido)],
                  ["Valor actual", mxn(detalle.valor)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="label-xs">{l}</p>
                    <p className="num text-[14px] font-semibold text-[var(--text)]">{v}</p>
                  </div>
                ))}
                <div>
                  <p className="label-xs">{detalle.ganancia >= 0 ? "Ganancia" : "Pérdida"}</p>
                  <p className="num text-[14px] font-bold" style={{ color: detalle.ganancia >= 0 ? VERDE : ROJO }}>
                    {detalle.ganancia >= 0 ? "+" : "−"}{mxn(Math.abs(detalle.ganancia))}
                  </p>
                </div>
                <div>
                  <p className="label-xs">Rendimiento</p>
                  <p className="num text-[14px] font-bold" style={{ color: detalle.rendimiento >= 0 ? VERDE : ROJO }}>
                    {pct(detalle.rendimiento)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {seleccion === "OTRAS" && otrasLista.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4">
              <p className="text-[13px] font-semibold text-[var(--text)]">Otras posiciones (toca una para su detalle):</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {otrasLista.map((x) => (
                  <button
                    key={x.p.id}
                    onClick={() => setSeleccion(x.p.clave)}
                    className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--accent-soft)]"
                  >
                    {x.p.clave} · {mxn(x.valor)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rendimiento por acción — barras divergentes clickeables */}
        <div className="card p-5">
          <h3 className="text-[14px] font-semibold text-[var(--text)]">Rendimiento por acción</h3>
          <p className="text-[12px] text-[var(--text-3)]">
            A la derecha ganan, a la izquierda pierden · toca una barra para su detalle
          </p>
          <div className="mt-4 flex flex-col gap-1">
            {porRendimiento.map(({ p, rendimiento }) => (
              <button
                key={p.id}
                onClick={() => setSeleccion(seleccion === p.clave ? null : p.clave)}
                className={`group flex items-center gap-3 rounded-lg px-2 py-1 transition ${seleccion === p.clave ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"}`}
              >
                <span className="num w-14 shrink-0 text-left text-[12px] font-bold text-[var(--text)]">{p.clave}</span>
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
              </button>
            ))}
          </div>
        </div>

        {/* Evolución */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text)]">Evolución del portafolio</h3>
              <p className="text-[12px] text-[var(--text-3)]">Un punto por día (se guarda solo a las 4pm) · toca un punto para ver ese día</p>
            </div>
            <div className="flex gap-4 text-[12px] text-[var(--text-2)]">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AZUL }} /> Valor</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AMBAR }} /> Invertido</span>
            </div>
          </div>
          {snapshots.length < 2 ? (
            <p className="mt-4 rounded-lg bg-[var(--surface-2)] px-4 py-6 text-center text-[13px] text-[var(--text-3)]">
              La gráfica aparece a partir del segundo día — el punto de hoy ya quedó guardado y desde mañana se dibuja la línea.
            </p>
          ) : (
            <EvolucionChart snapshots={snapshots} onDia={setDiaSel} diaSel={diaSel} />
          )}
          {diaSel && (
            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-2.5 text-[13px]">
              <span className="font-semibold text-[var(--text)]">
                {new Date(diaSel.fecha + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <span className="text-[var(--text-2)]">Invertido: <b className="num">{mxn(Number(diaSel.invertido))}</b></span>
              <span className="text-[var(--text-2)]">Valor: <b className="num" style={{ color: AZUL }}>{mxn(Number(diaSel.valor))}</b></span>
              <span className="num font-bold" style={{ color: Number(diaSel.valor) >= Number(diaSel.invertido) ? VERDE : ROJO }}>
                {Number(diaSel.valor) >= Number(diaSel.invertido) ? "+" : "−"}
                {mxn(Math.abs(Number(diaSel.valor) - Number(diaSel.invertido)))}
              </span>
            </div>
          )}
        </div>

        {/* Tabla */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[var(--text)]">Posiciones</h3>
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
                  <tr
                    key={p.id}
                    className={`cursor-pointer border-t border-[var(--border)] ${seleccion === p.clave ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"}`}
                    onClick={() => setSeleccion(seleccion === p.clave ? null : p.clave)}
                  >
                    <td className="num py-2.5 pr-3 font-bold text-[var(--text)]">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: colorDe(p.clave) }} />
                      {p.clave}
                    </td>
                    <td className="num py-2.5 pr-3 text-right text-[var(--text-2)]">{p.cantidad}</td>
                    <td className="num py-2.5 pr-3 text-right text-[var(--text-2)]">{mxn(p.costo_promedio, 2)}</td>
                    <td className="num py-2.5 pr-3 text-right text-[var(--text-2)]">{mxn(p.precio_actual, 2)}</td>
                    <td className="num py-2.5 pr-3 text-right text-[var(--text-2)]">{mxn(invertido)}</td>
                    <td className="num py-2.5 pr-3 text-right text-[var(--text)]">{mxn(valor)}</td>
                    <td className="num py-2.5 pr-3 text-right font-semibold" style={{ color: ganancia >= 0 ? VERDE : ROJO }}>
                      {ganancia >= 0 ? "+" : "−"}{mxn(Math.abs(ganancia))} <span className="text-[11px]">({pct(rendimiento)})</span>
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-[var(--text-2)]">{p.objetivo || "—"}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirEdicion(p); }}
                        className="text-[12px] font-semibold text-[var(--accent)] hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); eliminar(p); }}
                        className="ml-3 text-[12px] text-[var(--text-3)] hover:text-[#FF6B6B]"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Editor */}
        {editando !== null && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={() => setEditando(null)}>
            <div className="card mt-10 w-full max-w-md p-5" style={DARK_VARS} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[15px] font-semibold text-[var(--text)]">{editando === "nueva" ? "Agregar posición" : `Editar ${borrador.clave}`}</h3>
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

// Dona SVG clickeable: rebanadas con separación de 2px (stroke del fondo),
// selección "explotada" hacia afuera, centro con el total o la selección.
function Dona({
  rebanadas,
  total,
  seleccion,
  onSeleccion,
}: {
  rebanadas: { clave: string; valor: number; color: string }[];
  total: number;
  seleccion: string | null;
  onSeleccion: (clave: string) => void;
}) {
  const R = 92, r = 58, CX = 110, CY = 110;
  const sum = rebanadas.reduce((s, x) => s + x.valor, 0) || 1;
  let angulo = -Math.PI / 2;

  const sel = rebanadas.find((x) => x.clave === seleccion);

  return (
    <svg viewBox="0 0 220 220" className="w-[220px] shrink-0">
      {rebanadas.map((reb) => {
        const frac = reb.valor / sum;
        const a0 = angulo;
        const a1 = angulo + frac * Math.PI * 2;
        angulo = a1;
        const mid = (a0 + a1) / 2;
        const activa = seleccion === reb.clave;
        const dx = activa ? Math.cos(mid) * 7 : 0;
        const dy = activa ? Math.sin(mid) * 7 : 0;
        const grande = frac > 0.5 ? 1 : 0;
        const p = (a: number, rad: number) => `${CX + Math.cos(a) * rad},${CY + Math.sin(a) * rad}`;
        const d = [
          `M ${p(a0, R)}`,
          `A ${R} ${R} 0 ${grande} 1 ${p(a1, R)}`,
          `L ${p(a1, r)}`,
          `A ${r} ${r} 0 ${grande} 0 ${p(a0, r)}`,
          "Z",
        ].join(" ");
        return (
          <path
            key={reb.clave}
            d={d}
            fill={reb.color}
            stroke={SURFACE}
            strokeWidth="2"
            transform={`translate(${dx},${dy})`}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => onSeleccion(reb.clave)}
          >
            <title>{`${reb.clave === "OTRAS" ? "Otras" : reb.clave}: $${reb.valor.toLocaleString("es-MX", { maximumFractionDigits: 0 })} (${(frac * 100).toFixed(1)}%)`}</title>
          </path>
        );
      })}
      <text x={CX} y={CY - 8} textAnchor="middle" fontSize="12" fill="#7286A5">
        {sel ? (sel.clave === "OTRAS" ? "Otras" : sel.clave) : "Total"}
      </text>
      <text x={CX} y={CY + 12} textAnchor="middle" fontSize="15" fontWeight="700" fill="#E7EDF7">
        {sel
          ? `${((sel.valor / sum) * 100).toFixed(1)}%`
          : `$${Math.round(total / 1000).toLocaleString("es-MX")}k`}
      </text>
    </svg>
  );
}

// Línea de evolución (2 series validadas) con puntos clickeables.
function EvolucionChart({
  snapshots,
  onDia,
  diaSel,
}: {
  snapshots: Snapshot[];
  onDia: (s: Snapshot | null) => void;
  diaSel: Snapshot | null;
}) {
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
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(122,162,247,0.14)" strokeWidth="1" />
          <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#7286A5">{fmtCorto(v)}</text>
        </g>
      ))}
      <path d={linea((s) => Number(s.invertido))} fill="none" stroke={AMBAR} strokeWidth="2" />
      <path d={linea((s) => Number(s.valor))} fill="none" stroke={AZUL} strokeWidth="2" />
      {snapshots.map((s, i) => (
        <g key={s.fecha} className="cursor-pointer" onClick={() => onDia(diaSel?.fecha === s.fecha ? null : s)}>
          <circle cx={x(xs[i])} cy={y(Number(s.valor))} r={diaSel?.fecha === s.fecha ? 6 : 4} fill={AZUL} stroke={SURFACE} strokeWidth="2" />
          <circle cx={x(xs[i])} cy={y(Number(s.invertido))} r={diaSel?.fecha === s.fecha ? 6 : 4} fill={AMBAR} stroke={SURFACE} strokeWidth="2" />
          {/* zona de clic generosa */}
          <rect x={x(xs[i]) - 12} y={PAD.t} width="24" height={H - PAD.t - PAD.b} fill="transparent" />
          {(i === 0 || i === snapshots.length - 1) && (
            <text x={x(xs[i])} y={H - 8} textAnchor="middle" fontSize="10" fill="#7286A5">
              {new Date(s.fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
