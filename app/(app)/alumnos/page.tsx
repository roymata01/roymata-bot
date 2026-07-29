"use client";

import { useCallback, useEffect, useState } from "react";

type Alumno = {
  id: string;
  nombre_certificado: string;
  curp: string;
  rfc: string | null;
  ocupacion: string | null;
  curso: string | null;
  created_at: string;
};

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AlumnosPage() {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/alumnos");
    const json = await res.json().catch(() => ({}));
    setAlumnos(json.alumnos ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla
    cargar();
  }, [cargar]);

  const link = typeof window !== "undefined" ? `${window.location.origin}/datos-alumno` : "/datos-alumno";

  async function copiarLink() {
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function exportarCSV() {
    const encabezados = ["Nombre para certificado", "CURP", "RFC", "Ocupación", "Curso", "Fecha"];
    const filas = visibles.map((a) => [
      a.nombre_certificado,
      a.curp,
      a.rfc ?? "",
      a.ocupacion ?? "",
      a.curso ?? "",
      new Date(a.created_at).toLocaleString("es-MX"),
    ]);
    // Se escapan las comillas y se envuelve cada celda: los nombres traen comas
    const csv = [encabezados, ...filas]
      .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    // BOM para que Excel abra bien los acentos
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `alumnos-vita-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? alumnos.filter((a) =>
        [a.nombre_certificado, a.curp, a.rfc, a.ocupacion, a.curso]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    : alumnos;

  if (cargando) return <div className="p-6 text-[13px] text-[var(--text-3)]">Cargando...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <h2 className="page-title">Información alumnos</h2>
          <p className="page-sub">
            Datos que tus alumnos llenan para su certificado: nombre, CURP, RFC y ocupación. Mándales el link
            y se van llenando aquí solos.
          </p>
        </div>

        {/* Link para compartir */}
        <div className="card flex flex-col gap-3 p-4">
          <p className="label-xs">Link para tus alumnos</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-[12px]">
              {link}
            </code>
            <button onClick={copiarLink} className="btn btn-primary">
              {copiado ? "¡Copiado!" : "Copiar link"}
            </button>
            <a href="/datos-alumno" target="_blank" rel="noreferrer" className="btn btn-ghost">
              Ver formulario
            </a>
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--text-2)]">
            Tip: si le agregas <code className="font-mono text-[11px]">?curso=Cruz Roja Acapulco</code> al final
            del link, cada registro queda etiquetado con ese curso — útil cuando das varios grupos.
          </p>
        </div>

        {/* Buscador + export */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, CURP, curso…"
          />
          <span className="text-[12px] text-[var(--text-3)]">
            {visibles.length} {visibles.length === 1 ? "alumno" : "alumnos"}
          </span>
          <button onClick={exportarCSV} disabled={visibles.length === 0} className="btn btn-ghost ml-auto">
            Descargar Excel (CSV)
          </button>
          <button onClick={cargar} className="btn btn-ghost">
            Actualizar
          </button>
        </div>

        {/* Lista */}
        {visibles.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="text-[14px] font-semibold">
              {alumnos.length === 0 ? "Todavía no hay registros" : "Ningún alumno coincide"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-[var(--text-2)]">
              {alumnos.length === 0
                ? "Copia el link de arriba y mándalo a tu grupo de alumnos. Cada quien llena sus datos y aparecen aquí al instante."
                : "Prueba con otro nombre o borra la búsqueda."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibles.map((a) => (
              <div key={a.id} className="card flex flex-col gap-2.5 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[14px] font-semibold">{a.nombre_certificado}</p>
                  <span className="text-[11px] text-[var(--text-3)]">{fecha(a.created_at)}</span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                  <span className="flex flex-col">
                    <span className="label-xs">CURP</span>
                    <span className="font-mono text-[12px] tracking-wide">{a.curp}</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="label-xs">RFC</span>
                    <span className="font-mono text-[12px] tracking-wide">
                      {a.rfc || <span className="font-sans text-[var(--text-3)]">—</span>}
                    </span>
                  </span>
                  <span className="flex flex-col">
                    <span className="label-xs">Ocupación</span>
                    <span className="text-[12px]">
                      {a.ocupacion || <span className="text-[var(--text-3)]">—</span>}
                    </span>
                  </span>
                  {a.curso && (
                    <span className="flex flex-col">
                      <span className="label-xs">Curso</span>
                      <span className="text-[12px]">{a.curso}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
