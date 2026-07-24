"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface Campaign {
  id: string;
  nombre: string;
  template_name: string;
  status: string;
  total: number;
  enviados: number;
  fallidos: number;
  por_dia: number;
  created_at: string;
}

const STATUS_UI: Record<string, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "#8a97ab" },
  enviando: { label: "Enviando", color: "#1a56db" },
  pausada: { label: "Pausada", color: "#d97706" },
  completada: { label: "Completada", color: "#16a34a" },
};

export default function CampanasPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("Recordatorio clase 1 de agosto");
  const [porDia, setPorDia] = useState(100);

  const load = useCallback(async () => {
    const { data } = await supabase.from("wa_campaigns").select("*").order("created_at", { ascending: false });
    setCampaigns((data as Campaign[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    load();
    const t = setInterval(load, 8000); // refresca el progreso en vivo
    return () => clearInterval(t);
  }, [load]);

  async function crear() {
    setCreando(true);
    try {
      const res = await fetch("/api/campanas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          template_name: "recordatorio_clase_hemorragias",
          template_lang: "es_MX",
          por_dia: porDia,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "error");
      alert(`Campaña creada con ${j.total} destinatarios. Revísala y dale "Enviar tanda" cuando quieras arrancar.`);
      await load();
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setCreando(false);
    }
  }

  async function accion(id: string, accion: "iniciar" | "pausar") {
    await fetch("/api/campanas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, accion }),
    });
    setTimeout(load, 1500);
  }

  if (loading) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <h2 className="page-title">Campañas de WhatsApp</h2>
          <p className="page-sub">
            Mensajes masivos a tus registrados (que dieron su teléfono) con plantillas aprobadas por Meta.
            Se envían espaciados por tandas para cuidar el número. Quien responde &quot;BAJA&quot; sale automáticamente.
          </p>
        </div>

        <div className="card flex flex-col gap-3 p-4">
          <p className="text-[13px] font-semibold">Nueva campaña — recordatorio de la clase</p>
          <label className="flex flex-col gap-1 text-sm">
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Envíos por tanda (calienta el número: empieza bajo)
            <input type="number" value={porDia} onChange={(e) => setPorDia(Number(e.target.value))} className="input" />
          </label>
          <p className="text-[11px] text-[var(--text-3)]">
            Plantilla: <code>recordatorio_clase_hemorragias</code> — debe estar aprobada por Meta antes de enviar.
          </p>
          <button onClick={crear} disabled={creando} className="btn btn-primary self-start">
            {creando ? "Creando..." : "Crear campaña con mis registrados"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {campaigns.map((c) => {
            const restante = c.total - c.enviados - c.fallidos;
            const pct = c.total ? Math.round(((c.enviados + c.fallidos) / c.total) * 100) : 0;
            const ui = STATUS_UI[c.status] ?? STATUS_UI.borrador;
            return (
              <div key={c.id} className="card flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold">{c.nombre}</p>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
                    style={{ borderColor: `${ui.color}40`, backgroundColor: `${ui.color}1a`, color: ui.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ui.color }} />
                    {ui.label}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg)]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ui.color }} />
                </div>
                <p className="text-[12px] text-[var(--text-2)]">
                  {c.enviados} enviados · {c.fallidos} fallidos · {restante} pendientes · de {c.total} ({c.por_dia}/tanda)
                </p>
                <div className="flex gap-2">
                  {c.status !== "completada" && restante > 0 && (
                    <button onClick={() => accion(c.id, "iniciar")} className="btn btn-primary !py-1.5 !text-xs">
                      {c.status === "enviando" ? "Enviar otra tanda" : "Enviar tanda"}
                    </button>
                  )}
                  {c.status === "enviando" && (
                    <button onClick={() => accion(c.id, "pausar")} className="btn btn-ghost !py-1.5 !text-xs">
                      Pausar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {campaigns.length === 0 && <p className="text-[13px] text-[var(--text-3)]">Todavía no hay campañas.</p>}
        </div>
      </div>
    </div>
  );
}
