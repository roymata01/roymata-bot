"use client";

import { useState } from "react";
import { validarAlumno, type DatosAlumno } from "@/lib/alumnos";

const VACIO: DatosAlumno = { nombre_certificado: "", curp: "", rfc: "", ocupacion: "" };

function Campo({
  etiqueta,
  ayuda,
  opcional,
  error,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  opcional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold text-[var(--text)]">{etiqueta}</span>
        {opcional && <span className="text-[11px] text-[var(--text-3)]">opcional</span>}
      </span>
      {ayuda && <span className="text-[12px] leading-snug text-[var(--text-2)]">{ayuda}</span>}
      {children}
      {error && <span className="text-[12px] font-medium text-[var(--danger)]">{error}</span>}
    </label>
  );
}

export function FormularioAlumno({ curso }: { curso?: string }) {
  const [datos, setDatos] = useState<DatosAlumno>(VACIO);
  const [errores, setErrores] = useState<Partial<Record<keyof DatosAlumno, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState("");

  const set = (campo: keyof DatosAlumno, valor: string) => {
    setDatos((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => ({ ...prev, [campo]: undefined }));
    setErrorGeneral("");
  };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const encontrados = validarAlumno(datos);
    if (Object.keys(encontrados).length > 0) {
      setErrores(encontrados);
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/alumnos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, curso }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setListo(true);
      } else if (json.errores) {
        setErrores(json.errores);
      } else {
        setErrorGeneral(json.error || "No se pudieron guardar tus datos. Intenta de nuevo.");
      }
    } catch {
      setErrorGeneral("Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(22,163,74,0.10)] text-2xl text-[var(--ok)]">
          ✓
        </div>
        <p className="text-[17px] font-semibold">¡Listo, {datos.nombre_certificado.trim().split(" ")[0]}!</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-[var(--text-2)]">
          Ya recibimos tus datos. Tu certificado se emitirá con el nombre:
        </p>
        <p className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[15px] font-semibold tracking-wide">
          {datos.nombre_certificado.trim()}
        </p>
        <p className="max-w-sm text-[12px] leading-relaxed text-[var(--text-3)]">
          Si algo quedó mal escrito, vuelve a llenar el formulario con la misma CURP y se corrige
          automáticamente.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="card flex flex-col gap-5 p-6">
      <Campo
        etiqueta="Nombre completo"
        ayuda="Escríbelo tal como quieres que aparezca impreso en tu certificado, con acentos y apellidos completos."
        error={errores.nombre_certificado}
      >
        <input
          className="input"
          value={datos.nombre_certificado}
          onChange={(e) => set("nombre_certificado", e.target.value)}
          placeholder="Ej. María Fernanda García López"
          autoComplete="name"
          maxLength={120}
        />
      </Campo>

      {datos.nombre_certificado.trim().length > 4 && (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg)] px-4 py-3">
          <p className="label-xs mb-1">Así se verá en tu certificado</p>
          <p className="text-[16px] font-semibold tracking-wide">{datos.nombre_certificado.trim()}</p>
        </div>
      )}

      <Campo etiqueta="CURP" ayuda="18 caracteres. La encuentras en tu acta de nacimiento o en gob.mx." error={errores.curp}>
        <input
          className="input font-mono tracking-wider uppercase"
          value={datos.curp}
          onChange={(e) => set("curp", e.target.value.toUpperCase())}
          placeholder="GALM950312MDFRPR04"
          maxLength={18}
          autoCapitalize="characters"
          spellCheck={false}
        />
      </Campo>

      <Campo etiqueta="RFC" ayuda="Si lo tienes a la mano. Sirve para tu factura." opcional error={errores.rfc}>
        <input
          className="input font-mono tracking-wider uppercase"
          value={datos.rfc}
          onChange={(e) => set("rfc", e.target.value.toUpperCase())}
          placeholder="GALM950312AB1"
          maxLength={13}
          autoCapitalize="characters"
          spellCheck={false}
        />
      </Campo>

      <Campo etiqueta="Ocupación" ayuda="A qué te dedicas hoy." opcional error={errores.ocupacion}>
        <input
          className="input"
          value={datos.ocupacion}
          onChange={(e) => set("ocupacion", e.target.value)}
          placeholder="Ej. Docente, enfermera, estudiante, seguridad privada"
          maxLength={80}
        />
      </Campo>

      {errorGeneral && (
        <p className="rounded-lg bg-[rgba(220,38,38,0.06)] px-3 py-2 text-[13px] font-medium text-[var(--danger)]">
          {errorGeneral}
        </p>
      )}

      <button type="submit" disabled={enviando} className="btn btn-primary !py-2.5 !text-[14px]">
        {enviando ? "Enviando…" : "Enviar mis datos"}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-[var(--text-3)]">
        Tus datos se usan únicamente para emitir tu certificado y tu factura. No se comparten con terceros.
      </p>
    </form>
  );
}
