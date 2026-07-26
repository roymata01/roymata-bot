import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Estadísticas por curso. Hoy solo existe el de hemorragias; cuando haya más
// cursos con su propia tabla/campo, se agregan aquí como otra entrada.
export async function GET() {
  const supabaseAuth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const hace7 = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [total, conTel, hoyReg, semana, clicks] = await Promise.all([
    supabase.from("registrations").select("id", { count: "exact", head: true }),
    supabase.from("registrations").select("id", { count: "exact", head: true }).not("phone", "is", null),
    supabase.from("registrations").select("id", { count: "exact", head: true }).gte("registered_at", hoy),
    supabase.from("registrations").select("id", { count: "exact", head: true }).gte("registered_at", hace7),
    supabase.from("whatsapp_clicks").select("id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    cursos: [
      {
        id: "hemorragias",
        nombre: "Control de Hemorragias",
        tipo: "Clase gratis en vivo",
        fecha: "Sábado 1 de agosto 2026, 6:00 p.m.",
        link: "https://cursos.vitarescue.com.mx/",
        linkClase: "https://cursos.vitarescue.com.mx/envivo",
        registrados: total.count ?? 0,
        conTelefono: conTel.count ?? 0,
        registradosHoy: hoyReg.count ?? 0,
        registradosSemana: semana.count ?? 0,
        clicksWhatsApp: clicks.count ?? 0,
      },
    ],
  });
}
