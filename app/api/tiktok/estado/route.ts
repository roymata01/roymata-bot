import { NextResponse } from "next/server";
import { leerTokenTikTok, tiktokConfigurado, borrarTokenTikTok } from "@/lib/tiktok/token";

export const dynamic = "force-dynamic";

// Estado de la conexión con TikTok para el panel.
export async function GET() {
  if (!tiktokConfigurado()) {
    return NextResponse.json({ configurado: false, conectado: false });
  }
  const token = await leerTokenTikTok();
  return NextResponse.json({
    configurado: true,
    conectado: !!token,
    displayName: token?.display_name ?? null,
    avatarUrl: token?.avatar_url ?? null,
    openId: token?.open_id ?? null,
  });
}

// Desconectar (borra el token guardado).
export async function DELETE() {
  await borrarTokenTikTok();
  return NextResponse.json({ ok: true });
}
