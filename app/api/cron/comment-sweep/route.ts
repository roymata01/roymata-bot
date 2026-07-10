import { NextRequest, NextResponse } from "next/server";
import { sweepInstagramComments } from "@/lib/inbox/sweep-instagram-comments";

// Cron diario de Vercel (vercel.json). Vercel manda Authorization: Bearer CRON_SECRET.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await sweepInstagramComments();
    console.log("Barrida de comentarios:", JSON.stringify(resultado));
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Error en la barrida de comentarios:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
