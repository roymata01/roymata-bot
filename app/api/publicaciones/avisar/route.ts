import { NextRequest, NextResponse } from "next/server";
import { entregarARoy } from "@/lib/publicador/flujo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ruta A de la cadenita: scripts/mandar-video-roy.mjs (en la Mac) ya guardó el
// video en el bucket "publicaciones", lo subió a WhatsApp y creó la fila.
// Aquí se le manda a Roy (documento + copys) o, si la ventana de 24 h está
// cerrada, el aviso por plantilla para que conteste.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  try {
    const como = await entregarARoy(String(id));
    return NextResponse.json({ ok: true, como });
  } catch (e) {
    console.error("publicaciones/avisar:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
