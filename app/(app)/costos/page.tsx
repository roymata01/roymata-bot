"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface UsageLog {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

function formatUsd(n: number) {
  return `$${n.toFixed(n < 1 ? 4 : 2)} USD`;
}

export default function CostosPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [logs, setLogs] = useState<UsageLog[] | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("token_usage_logs")
        .select("model, input_tokens, output_tokens, cost_usd, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      setLogs((data as UsageLog[]) ?? []);
    }
    load();
  }, [supabase]);

  if (!logs) return <div className="p-6 text-sm text-neutral-500">Cargando...</div>;

  const totalCost = logs.reduce((sum, l) => sum + Number(l.cost_usd), 0);
  const totalCalls = logs.length;
  const costoPromedioPorMensaje = totalCalls > 0 ? totalCost / totalCalls : 0;

  const now = new Date();
  const thisMonthLogs = logs.filter((l) => {
    const d = new Date(l.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const costoEsteMes = thisMonthLogs.reduce((sum, l) => sum + Number(l.cost_usd), 0);

  const porModelo = logs.reduce<Record<string, { cost: number; calls: number }>>((acc, l) => {
    const key = l.model;
    if (!acc[key]) acc[key] = { cost: 0, calls: 0 };
    acc[key].cost += Number(l.cost_usd);
    acc[key].calls += 1;
    return acc;
  }, {});

  const porDia = logs.slice(0, 300).reduce<Record<string, number>>((acc, l) => {
    const day = l.created_at.slice(0, 10);
    acc[day] = (acc[day] ?? 0) + Number(l.cost_usd);
    return acc;
  }, {});
  const ultimosDias = Object.entries(porDia)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold">Costos</h2>
          <p className="text-sm text-neutral-600">Consumo de tokens de Claude y costo estimado.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border-2 border-black bg-white p-4">
            <p className="text-xs font-medium text-neutral-600">Gasto total</p>
            <p className="mt-1 text-2xl font-bold">{formatUsd(totalCost)}</p>
          </div>
          <div className="rounded-2xl border-2 border-black bg-white p-4">
            <p className="text-xs font-medium text-neutral-600">Este mes</p>
            <p className="mt-1 text-2xl font-bold">{formatUsd(costoEsteMes)}</p>
          </div>
          <div className="rounded-2xl border-2 border-black bg-white p-4">
            <p className="text-xs font-medium text-neutral-600">Respuestas generadas</p>
            <p className="mt-1 text-2xl font-bold">{totalCalls}</p>
          </div>
          <div className="rounded-2xl border-2 border-black bg-white p-4">
            <p className="text-xs font-medium text-neutral-600">Costo promedio / respuesta</p>
            <p className="mt-1 text-2xl font-bold">{formatUsd(costoPromedioPorMensaje)}</p>
          </div>
        </div>

        <section className="rounded-2xl border-2 border-black bg-white p-5">
          <h3 className="mb-3 font-bold">Por modelo</h3>
          <div className="flex flex-col gap-2">
            {Object.entries(porModelo).map(([model, data]) => (
              <div key={model} className="flex items-center justify-between border-b border-black/10 pb-2 text-sm">
                <span className="font-medium">{model}</span>
                <span>
                  {data.calls} respuestas · {formatUsd(data.cost)}
                </span>
              </div>
            ))}
            {Object.keys(porModelo).length === 0 && <p className="text-sm text-neutral-500">Sin datos todavía.</p>}
          </div>
        </section>

        <section className="rounded-2xl border-2 border-black bg-white p-5">
          <h3 className="mb-3 font-bold">Últimos días</h3>
          <div className="flex flex-col gap-1">
            {ultimosDias.map(([day, cost]) => (
              <div key={day} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-neutral-600">{day}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full border border-black/20 bg-neutral-100">
                  <div
                    className="h-full bg-orange-500"
                    style={{ width: `${Math.min(100, (cost / Math.max(...ultimosDias.map((d) => d[1]), 0.0001)) * 100)}%` }}
                  />
                </div>
                <span className="w-20 text-right">{formatUsd(cost)}</span>
              </div>
            ))}
            {ultimosDias.length === 0 && <p className="text-sm text-neutral-500">Sin datos todavía.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
