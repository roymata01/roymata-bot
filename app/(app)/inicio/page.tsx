"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Datos {
  porAtender: number;
  sinLeer: number;
  cotizacionesPendientes: number;
  ticketsPendientes: number;
  ticketsUrgentes: number;
  invitacionesEnviadas: number;
  registrosBot: number;
  gastoIaMesUsd: number;
}

function Tarjeta({ href, titulo, valor, detalle, alerta }: { href: string; titulo: string; valor: string | number; detalle?: string; alerta?: boolean }) {
  return (
    <Link href={href} className="card flex flex-col gap-1 p-4 transition hover:border-white/20">
      <p className="label-xs">{titulo}</p>
      <p className={`num text-2xl font-bold ${alerta ? "text-[#f0b429]" : ""}`}>{valor}</p>
      {detalle && <p className="text-[11px] text-[var(--text-3)]">{detalle}</p>}
    </Link>
  );
}

export default function InicioPage() {
  const [d, setD] = useState<Datos | null>(null);

  useEffect(() => {
    fetch("/api/inicio")
      .then((r) => r.json())
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla
      .then(setD)
      .catch(() => {});
  }, []);

  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <h2 className="page-title">Inicio</h2>
          <p className="page-sub capitalize">{hoy}</p>
        </div>

        {!d ? (
          <p className="text-[13px] text-[var(--text-3)]">Cargando tu día...</p>
        ) : (
          <>
            <p className="label-xs">Necesita tu atención</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tarjeta href="/inbox" titulo="Por atender" valor={d.porAtender} detalle="conversaciones escaladas" alerta={d.porAtender > 0} />
              <Tarjeta href="/inbox" titulo="Sin leer" valor={d.sinLeer} detalle="mensajes nuevos" />
              <Tarjeta href="/cotizaciones" titulo="Cotizaciones" valor={d.cotizacionesPendientes} detalle="pendientes de responder" alerta={d.cotizacionesPendientes > 0} />
              <Tarjeta href="/facturacion" titulo="Tickets" valor={d.ticketsPendientes} detalle={d.ticketsUrgentes > 0 ? `${d.ticketsUrgentes} vencen esta semana` : "por facturar"} alerta={d.ticketsUrgentes > 0} />
            </div>

            <p className="label-xs pt-2">La máquina del curso</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tarjeta href="/resumen" titulo="Invitaciones" valor={d.invitacionesEnviadas} detalle="enviadas por el bot" />
              <Tarjeta href="/resumen" titulo="Registros del bot" valor={d.registrosBot} detalle="al curso, rastreados" />
              <Tarjeta href="/costos" titulo="Gasto IA del mes" valor={`$${d.gastoIaMesUsd.toFixed(2)}`} detalle="USD en Claude" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
