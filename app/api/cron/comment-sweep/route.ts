import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepInstagramComments } from "@/lib/inbox/sweep-instagram-comments";

// Cron diario de Vercel (vercel.json). Vercel manda Authorization: Bearer CRON_SECRET.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Apagador total del bot (Roy 12-oct): pausado = sin DMs de invitación.
  const { data: ajustes } = await createAdminClient()
    .from("assistant_settings").select("is_paused").eq("id", 1).single();
  if (ajustes?.is_paused) return NextResponse.json({ pausado: true });

  try {
    const resultado = await sweepInstagramComments();
    console.log("Barrida de comentarios:", JSON.stringify(resultado));
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Error en la barrida de comentarios:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
