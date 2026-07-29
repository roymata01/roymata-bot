import type { Metadata } from "next";
import Image from "next/image";
import { FormularioAlumno } from "@/components/FormularioAlumno";

// Página PÚBLICA (fuera del grupo (app), sin sesión): es el link que Roy manda
// a los alumnos de un curso para recolectar los datos de sus certificados.
export const metadata: Metadata = {
  title: "Información del alumno · VITA RESCUE",
  description: "Registra tus datos para la emisión de tu certificado de primeros auxilios.",
};

export default async function DatosAlumnoPage({
  searchParams,
}: {
  searchParams: Promise<{ curso?: string }>;
}) {
  const { curso } = await searchParams;

  return (
    <div className="min-h-full bg-[var(--bg)]">
      <header className="bg-[#0D0D0D]">
        <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-4">
          <Image src="/logo-vita.png" alt="VITA RESCUE" width={132} height={38} priority className="h-8 w-auto" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
            Certificación
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-8">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Información del alumno</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-2)]">
            Llena estos datos para emitir tu certificado del curso de primeros auxilios
            {curso ? <> de <strong className="font-semibold text-[var(--text)]">{curso}</strong></> : null}. Toma
            menos de un minuto y solo se hace una vez.
          </p>
        </div>

        <FormularioAlumno curso={curso} />

        <p className="pb-6 text-center text-[11px] text-[var(--text-3)]">
          VITA RESCUE · Capacitación en emergencias médicas
        </p>
      </main>
    </div>
  );
}
