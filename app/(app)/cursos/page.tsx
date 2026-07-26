"use client";

import { useEffect, useState } from "react";

interface Curso {
  id: string;
  nombre: string;
  tipo: string;
  fecha: string;
  link: string;
  linkClase: string;
  registrados: number;
  conTelefono: number;
  registradosHoy: number;
  registradosSemana: number;
  clicksWhatsApp: number;
}

function Stat({ titulo, valor }: { titulo: string; valor: number | string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-[var(--accent-soft)] p-3">
      <p className="label-xs">{titulo}</p>
      <p className="num text-xl font-bold">{valor}</p>
    </div>
  );
}

export default function CursosPage() {
  const [cursos, setCursos] = useState<Curso[] | null>(null);

  useEffect(() => {
    fetch("/api/cursos")
      .then((r) => r.json())
      .then((d) => setCursos(d.cursos ?? []))
      .catch(() => setCursos([]));
  }, []);

  if (!cursos) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <h2 className="page-title">Cursos</h2>
          <p className="page-sub">Tus cursos y clases con sus registros en tiempo real.</p>
        </div>

        {cursos.map((c) => (
          <div key={c.id} className="card flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[16px] font-semibold">{c.nombre}</p>
                <p className="text-[12px] text-[var(--text-3)]">
                  {c.tipo} · {c.fecha}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[#16a34a40] bg-[#16a34a1a] px-2.5 py-1 text-xs font-medium text-[#16a34a]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                Activo
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat titulo="Registrados" valor={c.registrados.toLocaleString()} />
              <Stat titulo="Con teléfono" valor={c.conTelefono.toLocaleString()} />
              <Stat titulo="Hoy" valor={c.registradosHoy} />
              <Stat titulo="Últimos 7 días" valor={c.registradosSemana} />
            </div>

            <div className="flex flex-wrap gap-2">
              <a href={c.link} target="_blank" rel="noreferrer" className="btn btn-primary !py-1.5 !text-xs">
                Página de registro
              </a>
              <a href={c.linkClase} target="_blank" rel="noreferrer" className="btn btn-ghost !py-1.5 !text-xs">
                Link de la clase en vivo
              </a>
            </div>
            <p className="text-[11px] text-[var(--text-3)]">
              {c.clicksWhatsApp.toLocaleString()} clicks al grupo de WhatsApp
            </p>
          </div>
        ))}

        <p className="text-[12px] text-[var(--text-3)]">
          Cuando lances un curso nuevo, se agrega aquí para verlo igual que este.
        </p>
      </div>
    </div>
  );
}
