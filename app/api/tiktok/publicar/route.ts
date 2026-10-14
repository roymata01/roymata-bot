import { NextRequest, NextResponse } from "next/server";
import { accessTokenTikTok } from "@/lib/tiktok/token";

const API = "https://open.tiktokapis.com/v2";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Publica el video de prueba (public/tiktok-demo.mp4) en la cuenta conectada
// vía Content Posting API (FILE_UPLOAD en un solo chunk). Mientras la app no
// esté auditada por TikTok, el video se publica como SELF_ONLY (solo visible
// para la cuenta) — es el modo que exige el sandbox y perfecto para el demo.
export async function POST(req: NextRequest) {
  const token = await accessTokenTikTok();
  if (!token) return NextResponse.json({ error: "TikTok no está conectado" }, { status: 400 });

  try {
    const cuerpo = (await req.json().catch(() => ({}))) as { titulo?: string; modo?: string };
    const titulo = cuerpo?.titulo || "Video de prueba VITA RESCUE 🚑";
    // "borrador" = Upload to TikTok (el video llega a la bandeja del creador y
    // él lo publica desde la app) — funciona SIN auditoría en cuentas públicas.
    // "directo" = Direct Post — hasta que TikTok audite la app, solo funciona
    // en cuentas PRIVADAS (error unaudited_client_can_only_post_to_private_accounts).
    const modo = cuerpo?.modo === "directo" ? "directo" : "borrador";
    // El video vive en una URL pública (env TIKTOK_DEMO_VIDEO_URL o el mp4 del
    // propio sitio) — en Vercel el filesystem de la función no trae public/.
    const videoUrl = process.env.TIKTOK_DEMO_VIDEO_URL || `${req.nextUrl.origin}/tiktok-demo.mp4`;
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      return NextResponse.json({ error: `No se pudo leer el video (${videoRes.status})` }, { status: 500 });
    }
    const video = Buffer.from(await videoRes.arrayBuffer());

    const sourceInfo = {
      source: "FILE_UPLOAD",
      video_size: video.byteLength,
      chunk_size: video.byteLength,
      total_chunk_count: 1,
    };

    // 1. init: declara el video y pide la URL de subida
    const init = await fetch(
      modo === "directo" ? `${API}/post/publish/video/init/` : `${API}/post/publish/inbox/video/init/`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          modo === "directo"
            ? {
                post_info: {
                  title: titulo,
                  privacy_level: "SELF_ONLY",
                  disable_comment: false,
                  disable_duet: true,
                  disable_stitch: true,
                },
                source_info: sourceInfo,
              }
            : { source_info: sourceInfo }
        ),
      }
    );
    const initData = await init.json();
    if (!init.ok || initData?.error?.code !== "ok") {
      console.error("TikTok init:", initData);
      return NextResponse.json({ error: initData?.error?.message ?? "init falló", detalle: initData }, { status: 500 });
    }

    // 2. subir el archivo completo (un solo chunk)
    const subir = await fetch(initData.data.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(video.byteLength),
        "Content-Range": `bytes 0-${video.byteLength - 1}/${video.byteLength}`,
      },
      body: Uint8Array.from(video),
    });
    if (!subir.ok) {
      return NextResponse.json({ error: `subida falló: ${subir.status}` }, { status: 500 });
    }

    // 3. esperar el procesamiento (unos segundos) y reportar el estado
    const publishId = initData.data.publish_id as string;
    let estado: unknown = null;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await fetch(`${API}/post/publish/status/fetch/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ publish_id: publishId }),
      }).then((r) => r.json());
      estado = st?.data;
      const s = st?.data?.status;
      if (s === "PUBLISH_COMPLETE" || s === "FAILED") break;
    }

    return NextResponse.json({ ok: true, modo, publishId, estado });
  } catch (e) {
    console.error("TikTok publicar:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
