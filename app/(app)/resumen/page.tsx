"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { CHANNELS } from "@/lib/channels";
import type { Channel, Message } from "@/types/database";

interface Metrics {
  total: number;
  porAtender: number;
  conIA: number;
  atendiendo: number;
  cerradas: number;
  mensajesPorCanal: Record<Channel, number>;
  mensajesIA: number;
  mensajesHumano: number;
  tiempoRespuestaPromedioMin: number | null;
}

function Card({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className={`card p-4 ${accent ?? ""}`}>
      <p className="label-xs">{label}</p>
      <p className="num mt-1.5 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default function ResumenPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    async function load() {
      const [{ count: total }, { count: porAtender }, { count: conIA }, { count: atendiendo }, { count: cerradas }] =
        await Promise.all([
          supabase.from("conversations").select("*", { count: "exact", head: true }),
          supabase.from("conversations").select("*", { count: "exact", head: true }).eq("status", "por_atender"),
          supabase.from("conversations").select("*", { count: "exact", head: true }).eq("status", "con_ia"),
          supabase.from("conversations").select("*", { count: "exact", head: true }).eq("status", "atendiendo"),
          supabase.from("conversations").select("*", { count: "exact", head: true }).eq("status", "cerrada"),
        ]);

      const { data: recentMessages } = await supabase
        .from("messages")
        .select("channel, direction, sender_type, conversation_id, created_at")
        .order("created_at", { ascending: true })
        .limit(1000);

      const messages = (recentMessages as Message[]) ?? [];
      const mensajesPorCanal: Record<Channel, number> = { whatsapp: 0, instagram: 0, messenger: 0 };
      let mensajesIA = 0;
      let mensajesHumano = 0;
      for (const m of messages) {
        mensajesPorCanal[m.channel] = (mensajesPorCanal[m.channel] ?? 0) + 1;
        if (m.sender_type === "ai") mensajesIA += 1;
        if (m.sender_type === "human") mensajesHumano += 1;
      }

      // tiempo de respuesta: de un mensaje entrante al siguiente saliente en la misma conversación
      const byConversation = new Map<string, Message[]>();
      for (const m of messages) {
        const list = byConversation.get(m.conversation_id) ?? [];
        list.push(m);
        byConversation.set(m.conversation_id, list);
      }
      const deltasMin: number[] = [];
      for (const list of byConversation.values()) {
        for (let i = 0; i < list.length - 1; i++) {
          if (list[i].direction === "in" && list[i + 1].direction === "out") {
            const delta = (new Date(list[i + 1].created_at).getTime() - new Date(list[i].created_at).getTime()) / 60000;
            if (delta >= 0 && delta < 24 * 60) deltasMin.push(delta);
          }
        }
      }
      const tiempoRespuestaPromedioMin =
        deltasMin.length > 0 ? deltasMin.reduce((a, b) => a + b, 0) / deltasMin.length : null;

      setMetrics({
        total: total ?? 0,
        porAtender: porAtender ?? 0,
        conIA: conIA ?? 0,
        atendiendo: atendiendo ?? 0,
        cerradas: cerradas ?? 0,
        mensajesPorCanal,
        mensajesIA,
        mensajesHumano,
        tiempoRespuestaPromedioMin,
      });
    }
    load();
  }, [supabase]);

  if (!metrics) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div>
          <h2 className="page-title">Resumen</h2>
          <p className="page-sub">Métricas generales de la bandeja.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card label="Conversaciones totales" value={metrics.total} />
          <Card label="Por atender" value={metrics.porAtender} accent={metrics.porAtender > 0 ? "!border-[#e5484d]/40" : ""} />
          <Card label="Con IA" value={metrics.conIA} />
          <Card label="Atendiendo (humano)" value={metrics.atendiendo} />
          <Card label="Cerradas" value={metrics.cerradas} />
          <Card
            label="Tiempo de respuesta promedio"
            value={
              metrics.tiempoRespuestaPromedioMin === null
                ? "—"
                : metrics.tiempoRespuestaPromedioMin < 1
                  ? "< 1 min"
                  : `${Math.round(metrics.tiempoRespuestaPromedioMin)} min`
            }
          />
        </div>

        <section className="card p-5">
          <p className="label-xs mb-3">Mensajes por canal</p>
          <div className="flex flex-col gap-2.5">
            {CHANNELS.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <span className="w-24 text-[13px] font-medium">{c.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (metrics.mensajesPorCanal[c.key] / Math.max(1, metrics.mensajesPorCanal.whatsapp + metrics.mensajesPorCanal.instagram + metrics.mensajesPorCanal.messenger)) * 100)}%`,
                      backgroundColor: c.color,
                    }}
                  />
                </div>
                <span className="num w-10 text-right text-[13px] text-[var(--text-2)]">{metrics.mensajesPorCanal[c.key]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <p className="label-xs mb-3">Respuestas por IA vs. humano</p>
          <div className="flex gap-8">
            <div>
              <p className="num text-2xl font-semibold text-[#46b380]">{metrics.mensajesIA}</p>
              <p className="mt-0.5 text-xs text-[var(--text-2)]">mensajes de la IA</p>
            </div>
            <div>
              <p className="num text-2xl font-semibold text-[var(--accent)]">{metrics.mensajesHumano}</p>
              <p className="mt-0.5 text-xs text-[var(--text-2)]">mensajes tuyos/de tu equipo</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
