"use client";

// Vista de SOCIO del portafolio de Roy — SOLO LECTURA, fuera del panel:
// entra con el link secreto (?k=...) que Roy comparte; la llave se guarda en
// el navegador. No hay sesión del sistema ni acceso a ningún otro módulo.
// Visual: misma dona/gráficas del dashboard principal (dark validado).

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Posicion = {
  id: string;
  clave: string;
  cantidad: number;
  costo_promedio: number;
  precio_actual: number;
  objetivo: string | null;
};
type Snapshot = { fecha: string; invertido: number; valor: number };

const PALETA = ["#4C7DF0", "#B45309", "#2BA875", "#8B6FE8", "#E5484D", "#0FA5C0", "#D6336C"];
const GRIS_OTRAS = "#64748B";
const AZUL = "#4C7DF0";
const AMBAR = "#D9A23D";
const VERDE = "#2BD48A";
const ROJO = "#FF6B6B";
const SURFACE = "#131E33";

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

function Socio() {
  const params = useSearchParams();
  const [posiciones, setPosiciones] = useState<Posicion[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [fechaInicio, setFechaInicio] = useState<string | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "sin-acceso">("cargando");
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [diaSel, setDiaSel] = useState<Snapshot | null>(null);

  const cargar = useCallback(async () => {
    const deUrl = params.get("k");
    if (deUrl) localStorage.setItem("inv_socio_k", deUrl);
    const k = deUrl || localStorage.getItem("inv_socio_k");
    if (!k) { setEstado("sin-acceso"); return; }
    const res = await fetch("/api/inversiones/publico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ k }),
    });
    if (!res.ok) { setEstado("sin-acceso"); return; }
    const data = await res.json();
    setPosiciones(data.posiciones);
    setSnapshots(data.snapshots);
    setFechaInicio(data.fecha_inicio);
    setEstado("ok");
  }, [params]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    cargar();
  }, [cargar]);

  const totales = useMemo(() => {
    let invertido = 0, valor = 0;
    for (const p of posiciones) {
      const d = derivados(p);
      invertido += d.invertido;
      valor += d.valor;
    }
    const ganancia = valor - invertido;
    const rendimiento = invertido > 0 ? (ganancia / invertido) * 100 : 0;
    let anualizado: number | null = null;
    let dias = 0;
    if (fechaInicio && invertido > 0 && valor > 0) {
      dias = Math.max(1, Math.round((Date.now() - new Date(fechaInicio + "T12:00:00").getTime()) / 86400000));
      if (dias >= 30) anualizado = (Math.pow(valor / invertido, 365 / dias) - 1) * 100;
    }
    return { invertido, valor, ganancia, rendimiento, anualizado, dias };
  }, [posiciones, fechaInicio]);

  const porValor = useMemo(
    () => [...posiciones].map((p) => ({ p, ...derivados(p) })).sort((a, b) => b.valor - a.valor),
    [posiciones]
  );
  const porRendimiento = useMemo(
    () => [...posiciones].map((p) => ({ p, ...derivados(p) })).sort((a, b) => b.rendimiento - a.rendimiento),
    [posiciones]
  );
  const maxAbsRend = Math.max(...porRendimiento.map((x) => Math.abs(x.rendimiento)), 1);

  const rebanadas = useMemo(() => {
    const top = porValor.slice(0, 7).map((x, i) => ({ clave: x.p.clave, valor: x.valor, color: PALETA[i] }));
    const resto = porValor.slice(7);
    if (resto.length) top.push({ clave: "OTRAS", valor: resto.reduce((s, x) => s + x.valor, 0), color: GRIS_OTRAS });
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

  if (estado === "cargando")
    return <p className="p-8 text-center text-[13px] text-[#7286A5]">Cargando portafolio…</p>;

  if (estado === "sin-acceso")
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <p className="text-center text-[14px] text-[#A9B7D0]">
          Este portafolio es privado.<br />
          <span className="text-[#7286A5]">Pídele a Roy tu link de acceso.</span>
        </p>
      </div>
    );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#4C7DF0]">Vista de socio · solo lectura</p>
        <h1 className="mt-1 text-[20px] font-bold text-[#E7EDF7]">Portafolio de inversiones — Roy Mata</h1>
        <p className="text-[13px] text-[#7286A5]">
          {fechaInicio ? `Desde el ${new Date(fechaInicio + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })} · ` : ""}
          precios actualizados en automático cada día hábil a las 10am · toca cualquier gráfica para el detalle
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Total invertido", mxn(totales.invertido), "#E7EDF7"],
          ["Valor actual", mxn(totales.valor), AZUL],
        ].map(([l, v, c]) => (
          <div key={l as string} className="rounded-xl border border-[rgba(122,162,247,0.14)] bg-[#131E33] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#7286A5]">{l}</p>
            <p className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: c as string }}>{v}</p>
          </div>
        ))}
        <div className="rounded-xl border border-[rgba(122,162,247,0.14)] bg-[#131E33] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#7286A5]">{totales.ganancia >= 0 ? "Ganancia" : "Pérdida"}</p>
          <p className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: totales.ganancia >= 0 ? VERDE : ROJO }}>
            {totales.ganancia >= 0 ? "+" : "−"}{mxn(Math.abs(totales.ganancia))}
          </p>
          <p className="text-[12px] font-semibold" style={{ color: totales.ganancia >= 0 ? VERDE : ROJO }}>{pct(totales.rendimiento)}</p>
        </div>
        <div className="rounded-xl border border-[rgba(122,162,247,0.14)] bg-[#131E33] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#7286A5]">Posiciones</p>
          <p className="mt-1 text-[22px] font-bold tabular-nums text-[#E7EDF7]">{posiciones.length}</p>
        </div>
        <div className="rounded-xl border border-[rgba(122,162,247,0.14)] bg-[#131E33] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#7286A5]">Anualizado</p>
          {totales.anualizado === null ? (
            <p className="mt-1 text-[22px] font-bold text-[#7286A5]">—</p>
          ) : (
            <>
              <p className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: totales.anualizado >= 0 ? VERDE : ROJO }}>
                {pct(totales.anualizado)}
              </p>
              <p className="text-[11px] text-[#7286A5]">en {totales.dias} días</p>
            </>
          )}
        </div>
      </div>

      {/* Dona */}
      <div className="rounded-xl border border-[rgba(122,162,247,0.14)] bg-[#131E33] p-5">
        <h3 className="text-[14px] font-semibold text-[#E7EDF7]">Distribución del portafolio</h3>
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
          <Dona rebanadas={rebanadas} total={totales.valor} seleccion={seleccion} onSeleccion={(c) => setSeleccion(seleccion === c ? null : c)} />
          <div className="flex flex-1 flex-col gap-1.5">
            {rebanadas.map((r) => (
              <button
                key={r.clave}
                onClick={() => setSeleccion(seleccion === r.clave ? null : r.clave)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition ${seleccion === r.clave ? "bg-[rgba(61,123,253,0.16)]" : "hover:bg-[#182642]"}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="w-16 text-[13px] font-bold tabular-nums text-[#E7EDF7]">{r.clave === "OTRAS" ? "Otras" : r.clave}</span>
                <span className="flex-1 text-right text-[12px] tabular-nums text-[#A9B7D0]">{mxn(r.valor)}</span>
                <span className="w-12 text-right text-[11px] tabular-nums text-[#7286A5]">
                  {((r.valor / (totales.valor || 1)) * 100).toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        </div>

        {detalle && (
          <div className="mt-4 rounded-xl border border-[rgba(122,162,247,0.32)] bg-[#182642] p-4">
            <div className="flex items-center gap-2.5">
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: colorDe(detalle.p.clave) }} />
              <span className="text-[18px] font-bold tabular-nums text-[#E7EDF7]">{detalle.p.clave}</span>
              {detalle.p.objetivo && (
                <span className="rounded-full border border-[rgba(122,162,247,0.32)] px-2 py-0.5 text-[11px] text-[#A9B7D0]">
                  Objetivo: {detalle.p.objetivo}
                </span>
              )}
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
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#7286A5]">{l}</p>
                  <p className="text-[14px] font-semibold tabular-nums text-[#E7EDF7]">{v}</p>
                </div>
              ))}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#7286A5]">{detalle.ganancia >= 0 ? "Ganancia" : "Pérdida"}</p>
                <p className="text-[14px] font-bold tabular-nums" style={{ color: detalle.ganancia >= 0 ? VERDE : ROJO }}>
                  {detalle.ganancia >= 0 ? "+" : "−"}{mxn(Math.abs(detalle.ganancia))}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#7286A5]">Rendimiento</p>
                <p className="text-[14px] font-bold tabular-nums" style={{ color: detalle.rendimiento >= 0 ? VERDE : ROJO }}>
                  {pct(detalle.rendimiento)}
                </p>
              </div>
            </div>
          </div>
        )}

        {seleccion === "OTRAS" && otrasLista.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {otrasLista.map((x) => (
              <button
                key={x.p.id}
                onClick={() => setSeleccion(x.p.clave)}
                className="rounded-lg border border-[rgba(122,162,247,0.32)] px-3 py-1.5 text-[12px] font-semibold text-[#E7EDF7] hover:bg-[rgba(61,123,253,0.16)]"
              >
                {x.p.clave} · {mxn(x.valor)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rendimiento */}
      <div className="rounded-xl border border-[rgba(122,162,247,0.14)] bg-[#131E33] p-5">
        <h3 className="text-[14px] font-semibold text-[#E7EDF7]">Rendimiento por acción</h3>
        <div className="mt-4 flex flex-col gap-1">
          {porRendimiento.map(({ p, rendimiento }) => (
            <button
              key={p.id}
              onClick={() => setSeleccion(seleccion === p.clave ? null : p.clave)}
              className={`group flex items-center gap-3 rounded-lg px-2 py-1 transition ${seleccion === p.clave ? "bg-[rgba(61,123,253,0.16)]" : "hover:bg-[#182642]"}`}
            >
              <span className="w-14 shrink-0 text-left text-[12px] font-bold tabular-nums text-[#E7EDF7]">{p.clave}</span>
              <div className="relative h-5 flex-1">
                <div className="absolute inset-y-0 left-1/2 w-px bg-[rgba(122,162,247,0.32)]" />
                {rendimiento >= 0 ? (
                  <div className="absolute inset-y-0 left-1/2 rounded-r-[4px]" style={{ width: `${(rendimiento / maxAbsRend) * 50}%`, background: VERDE }} />
                ) : (
                  <div className="absolute inset-y-0 rounded-l-[4px]" style={{ right: "50%", width: `${(Math.abs(rendimiento) / maxAbsRend) * 50}%`, background: ROJO }} />
                )}
              </div>
              <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums" style={{ color: rendimiento >= 0 ? VERDE : ROJO }}>
                {pct(rendimiento)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Evolución */}
      <div className="rounded-xl border border-[rgba(122,162,247,0.14)] bg-[#131E33] p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[#E7EDF7]">Evolución</h3>
          <div className="flex gap-4 text-[12px] text-[#A9B7D0]">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AZUL }} /> Valor</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AMBAR }} /> Invertido</span>
          </div>
        </div>
        {snapshots.length < 2 ? (
          <p className="mt-4 rounded-lg bg-[#182642] px-4 py-6 text-center text-[13px] text-[#7286A5]">
            La gráfica se dibuja conforme pasan los días (un punto diario).
          </p>
        ) : (
          <EvolucionChart snapshots={snapshots} onDia={setDiaSel} diaSel={diaSel} />
        )}
        {diaSel && (
          <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-[rgba(122,162,247,0.32)] bg-[#182642] px-4 py-2.5 text-[13px]">
            <span className="font-semibold text-[#E7EDF7]">
              {new Date(diaSel.fecha + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <span className="text-[#A9B7D0]">Invertido: <b className="tabular-nums">{mxn(Number(diaSel.invertido))}</b></span>
            <span className="text-[#A9B7D0]">Valor: <b className="tabular-nums" style={{ color: AZUL }}>{mxn(Number(diaSel.valor))}</b></span>
          </div>
        )}
      </div>

      {/* Tabla solo lectura */}
      <div className="rounded-xl border border-[rgba(122,162,247,0.14)] bg-[#131E33] p-5">
        <h3 className="text-[14px] font-semibold text-[#E7EDF7]">Posiciones</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#7286A5]">
                <th className="py-2 pr-3">Clave</th>
                <th className="py-2 pr-3 text-right">Cantidad</th>
                <th className="py-2 pr-3 text-right">Costo prom.</th>
                <th className="py-2 pr-3 text-right">Precio actual</th>
                <th className="py-2 pr-3 text-right">Invertido</th>
                <th className="py-2 pr-3 text-right">Valor</th>
                <th className="py-2 pr-3 text-right">Ganancia</th>
                <th className="py-2">Objetivo</th>
              </tr>
            </thead>
            <tbody>
              {porValor.map(({ p, invertido, valor, ganancia, rendimiento }) => (
                <tr
                  key={p.id}
                  className={`cursor-pointer border-t border-[rgba(122,162,247,0.14)] ${seleccion === p.clave ? "bg-[rgba(61,123,253,0.16)]" : "hover:bg-[#182642]"}`}
                  onClick={() => setSeleccion(seleccion === p.clave ? null : p.clave)}
                >
                  <td className="py-2.5 pr-3 font-bold tabular-nums text-[#E7EDF7]">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: colorDe(p.clave) }} />
                    {p.clave}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-[#A9B7D0]">{p.cantidad}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-[#A9B7D0]">{mxn(p.costo_promedio, 2)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-[#A9B7D0]">{mxn(p.precio_actual, 2)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-[#A9B7D0]">{mxn(invertido)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-[#E7EDF7]">{mxn(valor)}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums" style={{ color: ganancia >= 0 ? VERDE : ROJO }}>
                    {ganancia >= 0 ? "+" : "−"}{mxn(Math.abs(ganancia))} <span className="text-[11px]">({pct(rendimiento)})</span>
                  </td>
                  <td className="py-2.5 text-[12px] text-[#A9B7D0]">{p.objetivo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="pb-6 text-center text-[11px] text-[#4A5A78]">
        Portafolio privado de Roy Mata · vista de solo lectura
      </p>
    </div>
  );
}

export default function InversionesSocioPage() {
  return (
    <div className="min-h-screen" style={{ background: "#0B1220" }}>
      <Suspense>
        <Socio />
      </Suspense>
    </div>
  );
}

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
        {sel ? `${((sel.valor / sum) * 100).toFixed(1)}%` : `$${Math.round(total / 1000).toLocaleString("es-MX")}k`}
      </text>
    </svg>
  );
}

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
