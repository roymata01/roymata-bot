import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validarAlumno, type DatosAlumno } from "@/lib/alumnos";

// POST público: el alumno manda sus datos desde /datos-alumno.
// Escribe con service_role porque la tabla solo permite leer/escribir al admin.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const datos: DatosAlumno = {
    nombre_certificado: String(body.nombre_certificado ?? ""),
    curp: String(body.curp ?? ""),
    rfc: String(body.rfc ?? ""),
    ocupacion: String(body.ocupacion ?? ""),
    curso: body.curso ? String(body.curso).slice(0, 80) : undefined,
  };

  const errores = validarAlumno(datos);
  if (Object.keys(errores).length > 0) {
    return NextResponse.json({ errores }, { status: 422 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("student_records").upsert(
    {
      nombre_certificado: datos.nombre_certificado.trim(),
      curp: datos.curp.trim().toUpperCase(),
      rfc: datos.rfc.trim().toUpperCase() || null,
      ocupacion: datos.ocupacion.trim() || null,
      curso: datos.curso?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "curp" }
  );

  if (error) {
    console.error("Error guardando datos de alumno:", error);
    return NextResponse.json({ error: "No se pudieron guardar tus datos. Intenta de nuevo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// GET protegido: la lista para el panel de Roy.
export async function GET() {
  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_records")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alumnos: data ?? [] });
}
