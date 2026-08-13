import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Cambia el estado de seguimiento de una cotización emitida
// (enviada → atendida → resuelta), desde los botones del panel.
export async function POST(req: NextRequest) {
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  const auth = req.headers.get("authorization");
  const conLlave = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!user && !conLlave) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { cotizacion_id, estado } = await req.json().catch(() => ({}));
  if (!cotizacion_id || !["enviada", "atendida", "resuelta"].includes(estado)) {
    return NextResponse.json({ error: "Faltan cotizacion_id o estado (enviada|atendida|resuelta)." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("cotizaciones_emitidas")
    .update({ estado })
    .eq("id", cotizacion_id);
  if (error) {
    // 23514 = check constraint: falta correr supabase-cotizaciones-estado.sql
    const detalle = error.code === "23514"
      ? "La base aún no acepta este estado — falta correr supabase-cotizaciones-estado.sql en el SQL Editor."
      : error.message;
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
  return NextResponse.json({ ok: true, estado });
}
