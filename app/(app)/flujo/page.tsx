"use client";

// Flujo de venta QUIERO — el diagrama vivo del embudo del Método HÉROE.
// Roy edita aquí lo que dice el bot en cada paso (lápiz → guardar); la
// estructura del embudo vive en lib/flujo-quiero.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  FLUJO_QUIERO,
  REGLAS_DE_ORO,
  aplicarOverrides,
  type NodoFlujo,
  type OverridesFlujo,
  type RamaFlujo,
} from "@/lib/flujo-quiero";
import { ChatIcon, PencilIcon, ZapIcon, ShieldIcon, ClockIcon } from "@/components/icons";

const COLOR_RAMA: Record<RamaFlujo["color"], { chip: string; borde: string }> = {
  verde: { chip: "bg-[#46b380]/12 text-[#2e8a5f] border-[#46b380]/30", borde: "border-t-[#46b380]" },
  ambar: { chip: "bg-[#d97706]/12 text-[#b45309] border-[#d97706]/30", borde: "border-t-[#d97706]" },
  rojo: { chip: "bg-[#dc2626]/10 text-[#b91c1c] border-[#dc2626]/25", borde: "border-t-[#dc2626]" },
  gris: { chip: "bg-black/5 text-[var(--text-2)] border-[var(--border-strong)]", borde: "border-t-[var(--border-strong)]" },
};

function Conector() {
  return (
    <div className="flex flex-col items-center py-1" aria-hidden>
      <div className="h-5 w-px bg-[var(--border-strong)]" />
      <svg width="10" height="6" viewBox="0 0 10 6" className="text-[var(--border-strong)]">
        <path d="M0 0 L5 6 L10 0" fill="currentColor" />
      </svg>
    </div>
  );
}

function Burbujas({ texto }: { texto: string }) {
  const burbujas = texto.split("|||").map((b) => b.trim()).filter(Boolean);
  return (
    <div className="flex flex-col items-start gap-1.5">
      {burbujas.map((b, i) => (
        <span
          key={i}
          className="max-w-full rounded-2xl rounded-bl-md border border-[#7c3aed]/20 bg-[#7c3aed]/[0.06] px-3 py-1.5 text-[13px] leading-snug text-[var(--text-1,#1f2937)]"
        >
          {b}
        </span>
      ))}
    </div>
  );
}

function TarjetaNodo({
  nodo,
  editando,
  onEditar,
  onCambiar,
}: {
  nodo: NodoFlujo;
  editando: boolean;
  onEditar: () => void;
  onCambiar: (campo: "texto" | "nota", valor: string) => void;
}) {
  const esBot = nodo.tipo === "bot";
  const icono =
    nodo.tipo === "disparador" ? <ZapIcon /> : esBot ? <ChatIcon /> : nodo.tipo === "accion" ? <ShieldIcon /> : <ClockIcon />;
  const colorIcono =
    nodo.tipo === "disparador"
      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
      : esBot
        ? "bg-[#7c3aed]/10 text-[#7c3aed]"
        : nodo.tipo === "accion"
          ? "bg-[#46b380]/12 text-[#2e8a5f]"
          : "bg-black/5 text-[var(--text-2)]";

  return (
    <div className="card w-full p-3.5">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colorIcono} [&_svg]:h-4 [&_svg]:w-4`}>
          {icono}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold">{nodo.titulo}</p>
            <button
              onClick={onEditar}
              className={`shrink-0 rounded-md p-1 ${editando ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-3)] hover:bg-black/5"}`}
              title="Editar este paso"
            >
              <PencilIcon />
            </button>
          </div>

          {editando ? (
            <div className="mt-2 flex flex-col gap-2">
              <label className="label-xs">{esBot ? "Lo que dice el bot (separa burbujas con |||)" : "Qué pasa en este paso"}</label>
              <textarea
                value={nodo.texto}
                onChange={(e) => onCambiar("texto", e.target.value)}
                rows={3}
                className="input !h-auto w-full resize-y text-[13px]"
              />
              <label className="label-xs">Nota / regla de tiempo</label>
              <textarea
                value={nodo.nota ?? ""}
                onChange={(e) => onCambiar("nota", e.target.value)}
                rows={2}
                className="input !h-auto w-full resize-y text-[12px]"
              />
            </div>
          ) : (
            <div className="mt-1.5">
              {esBot ? <Burbujas texto={nodo.texto} /> : <p className="text-[13px] leading-snug text-[var(--text-2)]">{nodo.texto}</p>}
              {nodo.nota && (
                <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-[var(--text-3)]">
                  <span className="mt-px shrink-0 [&_svg]:h-3 [&_svg]:w-3"><ClockIcon /></span>
                  {nodo.nota}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FlujoPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [overrides, setOverrides] = useState<OverridesFlujo>({});
  const [guardados, setGuardados] = useState<OverridesFlujo>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("bot_flujos").select("data").eq("id", "quiero").maybeSingle();
    const ov = ((data?.data as OverridesFlujo) ?? {}) as OverridesFlujo;
    setOverrides(ov);
    setGuardados(ov);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    cargar();
  }, [cargar]);

  const fases = useMemo(() => aplicarOverrides(FLUJO_QUIERO, overrides), [overrides]);
  const hayCambios = JSON.stringify(overrides) !== JSON.stringify(guardados);

  function cambiar(id: string, campo: "texto" | "nota", valor: string) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase
      .from("bot_flujos")
      .upsert({ id: "quiero", data: overrides, updated_at: new Date().toISOString() });
    if (err) {
      setError("No se pudo guardar. Si es la primera vez, falta correr el SQL de bot_flujos en Supabase.");
    } else {
      setGuardados(overrides);
      setEditando(null);
    }
    setGuardando(false);
  }

  async function restaurar() {
    if (!confirm("¿Regresar TODOS los textos a los originales?")) return;
    setOverrides({});
    setEditando(null);
    const { error: err } = await supabase
      .from("bot_flujos")
      .upsert({ id: "quiero", data: {}, updated_at: new Date().toISOString() });
    if (!err) setGuardados({});
  }

  if (cargando) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-24">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="page-title">Flujo de venta — QUIERO</h2>
            <span className="rounded-full border border-[#d97706]/30 bg-[#d97706]/10 px-2 py-0.5 text-[11px] font-medium text-[#b45309]">
              Borrador · el bot sigue apagado
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[var(--text-2)]">
            Así se va a comportar el bot con quien comente <strong>QUIERO</strong> en el video. Las burbujas moradas
            son los mensajes tal cual los mandaría — tócalas con el lápiz para editarlas y guarda. Cuando des el OK,
            conecto el bot a este flujo.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-[#dc2626]/25 bg-[#dc2626]/5 px-3 py-2 text-[12px] text-[#b91c1c]">{error}</div>
        )}

        {fases.map((fase, fi) => (
          <section key={fase.id}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7c3aed] text-[11px] font-bold text-white">
                {fi + 1}
              </span>
              <h3 className="text-[14px] font-semibold">{fase.nombre}</h3>
            </div>
            <p className="mb-3 pl-7 text-[12px] text-[var(--text-3)]">{fase.desc}</p>

            <div className="flex flex-col items-stretch">
              {fase.pasos.map((paso, pi) => (
                <div key={paso.tipo === "nodo" ? paso.nodo.id : paso.id}>
                  {pi > 0 && <Conector />}
                  {paso.tipo === "nodo" ? (
                    <TarjetaNodo
                      nodo={paso.nodo}
                      editando={editando === paso.nodo.id}
                      onEditar={() => setEditando(editando === paso.nodo.id ? null : paso.nodo.id)}
                      onCambiar={(campo, v) => cambiar(paso.nodo.id, campo, v)}
                    />
                  ) : (
                    <div>
                      <div className="flex justify-center">
                        <span className="rounded-full border border-[var(--border-strong)] bg-white px-3 py-1 text-[12px] font-semibold shadow-sm">
                          {paso.pregunta}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {paso.ramas.map((rama) => {
                          const c = COLOR_RAMA[rama.color];
                          return (
                            <div key={rama.id} className={`flex flex-col gap-2 rounded-xl border border-[var(--border)] border-t-2 ${c.borde} bg-black/[0.015] p-2.5`}>
                              <span className={`self-start rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.chip}`}>
                                {rama.etiqueta}
                              </span>
                              {rama.nodos.map((n) => (
                                <TarjetaNodo
                                  key={n.id}
                                  nodo={n}
                                  editando={editando === n.id}
                                  onEditar={() => setEditando(editando === n.id ? null : n.id)}
                                  onCambiar={(campo, v) => cambiar(n.id, campo, v)}
                                />
                              ))}
                              <p className="mt-auto pl-1 text-[11px] font-medium text-[var(--text-3)]">→ {rama.destino}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {fi < fases.length - 1 && <Conector />}
          </section>
        ))}

        <section className="card p-4">
          <h3 className="text-[13px] font-semibold">Reglas de oro (aplican en todo el flujo)</h3>
          <p className="mb-2 text-[11px] text-[var(--text-3)]">Estas ya viven en la personalización del bot; aquí nomás se recuerdan.</p>
          <ul className="flex flex-col gap-1">
            {REGLAS_DE_ORO.map((r) => (
              <li key={r} className="flex items-start gap-1.5 text-[12px] text-[var(--text-2)]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#7c3aed]" />
                {r}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex justify-end">
          <button onClick={restaurar} className="btn btn-ghost !text-xs">
            Restaurar textos originales
          </button>
        </div>
      </div>

      {hayCambios && (
        <div className="fixed inset-x-0 bottom-16 z-20 flex justify-center px-4 sm:bottom-6">
          <div className="flex items-center gap-3 rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 shadow-lg">
            <span className="text-[12px] text-[var(--text-2)]">Tienes cambios sin guardar</span>
            <button onClick={guardar} disabled={guardando} className="btn btn-primary !rounded-full !px-4 !py-1.5 !text-xs">
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
