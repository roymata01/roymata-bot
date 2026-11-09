import { NextRequest, NextResponse } from "next/server";
import { COOKIE_PIN, tokenDePin } from "@/lib/pin-secciones";

export const dynamic = "force-dynamic";

// Valida el PIN de las secciones privadas y deja la cookie (7 días en ese
// navegador). La cookie guarda un hash del PIN, nunca el PIN.
export async function POST(req: NextRequest) {
  const { pin } = await req.json().catch(() => ({}));
  const correcto = process.env.PIN_MUNDOS;
  if (!correcto) {
    return NextResponse.json({ error: "El PIN no está configurado en el servidor" }, { status: 503 });
  }
  if (String(pin ?? "").trim() !== correcto) {
    await new Promise((r) => setTimeout(r, 800)); // frena la adivinadera
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_PIN, await tokenDePin(correcto), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
