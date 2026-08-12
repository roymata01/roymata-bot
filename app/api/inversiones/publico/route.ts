import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Datos del portafolio para el ACCESO DE SOCIO (solo lectura): valida la llave
// secreta del link compartido (INVERSIONES_SOCIO_KEY) — sin sesión del panel,
// sin acceso a ninguna otra tabla del sistema.
export async function POST(req: NextRequest) {
  const { k } = await req.json().catch(() => ({}));
  if (!process.env.INVERSIONES_SOCIO_KEY || k !== process.env.INVERSIONES_SOCIO_KEY) {
    return NextResponse.json({ error: "Llave inválida" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const [{ data: posiciones }, { data: snapshots }, { data: config }] = await Promise.all([
    supabase.from("inversiones").select("id, clave, cantidad, costo_promedio, precio_actual, objetivo").order("clave"),
    supabase.from("inversiones_snapshots").select("*").order("fecha"),
    supabase.from("inversiones_config").select("fecha_inicio").eq("id", 1).maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true,
    posiciones: posiciones || [],
    snapshots: snapshots || [],
    fecha_inicio: config?.fecha_inicio || null,
  });
}
