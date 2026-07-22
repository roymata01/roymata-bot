import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rellenarNombresMessenger } from "@/lib/meta/fetch-messenger-name";

export const maxDuration = 60;

// Rellena los nombres de los contactos de Messenger que salen como número,
// usando la API de conversaciones de la Página. Acepta sesión del panel o CRON_SECRET.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const conLlave = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!conLlave) {
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const resultado = await rellenarNombresMessenger();
  return NextResponse.json(resultado);
}
