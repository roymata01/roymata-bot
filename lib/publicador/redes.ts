import { igToken } from "@/lib/meta/ig-token";
import { accessTokenTikTok } from "@/lib/tiktok/token";
import { tokensPublicador } from "@/lib/publicador/tokens";
import type { InfoVideo } from "@/lib/publicador/mp4-info";

// Publicación en cada red. Portado de ~/publicador/publicar.py (probado en
// producción el 27-nov-2026). Todo recibe el video ya en memoria (≤100 MB).

const GRAPH_FB = "https://graph.facebook.com/v21.0";
const GRAPH_IG = "https://graph.instagram.com/v21.0";
const RUPLOAD_IG = "https://rupload.facebook.com/ig-api-upload/v21.0";
const RUPLOAD_FB = "https://rupload.facebook.com/video-upload/v21.0";
const TIKTOK_API = "https://open.tiktokapis.com/v2";

export type CopyYouTube = { titulo: string; descripcion?: string; etiquetas?: string[] };
export type Copys = {
  instagram?: string;
  facebook?: string;
  youtube?: CopyYouTube;
  tiktok?: string;
};
export type Red = "instagram" | "facebook" | "youtube" | "tiktok";
export const REDES: Red[] = ["instagram", "facebook", "youtube", "tiktok"];

export class Falla extends Error {}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jsonMeta(res: Response) {
  const texto = await res.text();
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(texto);
  } catch {
    throw new Falla(`HTTP ${res.status}: ${texto.slice(0, 300)}`);
  }
  if (d && typeof d === "object" && "error" in d && d.error) {
    const e = d.error as Record<string, string>;
    throw new Falla(e.error_user_msg || e.message || JSON.stringify(e));
  }
  if (!res.ok) throw new Falla(`HTTP ${res.status}: ${texto.slice(0, 300)}`);
  return d as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// el video sin copiarlo (100 MB × 3 redes en paralelo)
const vista = (b: Buffer) => new Uint8Array(b.buffer as ArrayBuffer, b.byteOffset, b.length);

const form = (datos: Record<string, string>) => new URLSearchParams(datos);

// ---------------- Instagram (Reels) ----------------
export async function publicarInstagram(video: Buffer, copy: string, info: InfoVideo): Promise<string> {
  if (info.duracion && (info.duracion < 3 || info.duracion > 900))
    throw new Falla(`Instagram acepta reels de 3 s a 15 min (este dura ${info.duracion} s)`);
  const tok = await igToken();
  if (!tok) throw new Falla("no hay token de Instagram");
  const igId = process.env.IG_BUSINESS_ACCOUNT_ID;
  if (!igId) throw new Falla("falta IG_BUSINESS_ACCOUNT_ID");

  const c = await jsonMeta(
    await fetch(`${GRAPH_IG}/${igId}/media`, {
      method: "POST",
      body: form({
        media_type: "REELS",
        upload_type: "resumable",
        caption: copy,
        share_to_feed: "true",
        access_token: tok,
      }),
    })
  );
  const cont = c.id as string;
  await jsonMeta(
    await fetch(`${RUPLOAD_IG}/${cont}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${tok}`, offset: "0", file_size: String(video.length) },
      body: vista(video),
    })
  );
  for (let i = 0; ; i++) {
    const s = await jsonMeta(await fetch(`${GRAPH_IG}/${cont}?fields=status_code,status&access_token=${tok}`));
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED")
      throw new Falla(`Instagram no pudo procesar el video: ${s.status}`);
    if (i >= 120) throw new Falla("Instagram tardó más de 10 min en procesar el video");
    await espera(5000);
  }
  const p = await jsonMeta(
    await fetch(`${GRAPH_IG}/${igId}/media_publish`, {
      method: "POST",
      body: form({ creation_id: cont, access_token: tok }),
    })
  );
  const l = await jsonMeta(await fetch(`${GRAPH_IG}/${p.id}?fields=permalink&access_token=${tok}`));
  return (l.permalink as string) || `id ${p.id}`;
}

// ---------------- Facebook (reel de la página o video normal) ----------------
export const esReelFacebook = (info: InfoVideo) => info.vertical && info.duracion <= 90;

export async function publicarFacebook(
  video: Buffer,
  copy: string,
  info: InfoVideo,
  nombre: string
): Promise<string> {
  const tok = (await tokensPublicador()).FB_PUBLICAR_TOKEN;
  if (!tok) throw new Falla("falta el token de Facebook para publicar (FB_PUBLICAR_TOKEN)");
  const pagina = process.env.FB_PAGE_ID;
  if (!pagina) throw new Falla("falta FB_PAGE_ID");
  if (info.duracion && info.duracion < 3) throw new Falla("Facebook pide al menos 3 s de video");

  if (!esReelFacebook(info)) {
    const fd = new FormData();
    fd.set("description", copy);
    fd.set("access_token", tok);
    fd.set("source", new Blob([new Uint8Array(video)], { type: "video/mp4" }), nombre || "video.mp4");
    const d = await jsonMeta(await fetch(`https://graph-video.facebook.com/v21.0/${pagina}/videos`, { method: "POST", body: fd }));
    return `https://www.facebook.com/${pagina}/videos/${d.id}`;
  }

  const ini = await jsonMeta(
    await fetch(`${GRAPH_FB}/${pagina}/video_reels`, {
      method: "POST",
      body: form({ upload_phase: "start", access_token: tok }),
    })
  );
  const vid = ini.video_id as string;
  await jsonMeta(
    await fetch(`${RUPLOAD_FB}/${vid}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${tok}`, offset: "0", file_size: String(video.length) },
      body: vista(video),
    })
  );
  await jsonMeta(
    await fetch(`${GRAPH_FB}/${pagina}/video_reels`, {
      method: "POST",
      body: form({
        upload_phase: "finish",
        video_id: vid,
        video_state: "PUBLISHED",
        description: copy,
        access_token: tok,
      }),
    })
  );
  return `https://www.facebook.com/reel/${vid}`;
}

// ---------------- YouTube (Shorts) ----------------
async function tokenYouTube(): Promise<string> {
  const t = await tokensPublicador();
  if (!t.YT_CLIENT_ID || !t.YT_CLIENT_SECRET || !t.YT_REFRESH_TOKEN)
    throw new Falla("YouTube no está conectado (faltan YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN)");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: form({
      client_id: t.YT_CLIENT_ID,
      client_secret: t.YT_CLIENT_SECRET,
      refresh_token: t.YT_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Falla(`YouTube rechazó la conexión: ${d.error_description || JSON.stringify(d)}`);
  return d.access_token;
}

export async function publicarYouTube(video: Buffer, copy: CopyYouTube): Promise<string> {
  const tok = await tokenYouTube();
  const cuerpo = {
    snippet: {
      title: copy.titulo.slice(0, 100),
      description: copy.descripcion ?? "",
      tags: copy.etiquetas ?? [],
      categoryId: "27",
      defaultLanguage: "es",
    },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  };
  const ini = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(video.length),
      },
      body: JSON.stringify(cuerpo),
    }
  );
  const destino = ini.headers.get("location");
  if (!ini.ok || !destino) throw new Falla(`YouTube no aceptó el inicio: ${(await ini.text()).slice(0, 300)}`);
  const r = await fetch(destino, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: vista(video),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new Falla(`YouTube falló al subir: ${JSON.stringify(d).slice(0, 300)}`);
  let link = `https://youtube.com/shorts/${d.id}`;
  const priv = d.status?.privacyStatus;
  if (priv && priv !== "public")
    link += ` (YouTube lo dejó ${priv}: ponerlo Público en https://studio.youtube.com/video/${d.id}/edit)`;
  return link;
}

// ---------------- TikTok (Direct Post) ----------------
// Solo se usa cuando TikTok apruebe la app (TIKTOK_DIRECT_POST=1 en Vercel y la
// cuenta reconectada con el permiso video.publish). Mientras tanto, la app sin
// auditar solo puede publicar en privado, y Roy no quiere eso: TikTok se sube
// desde la Mac (skill publicar, TikTok Studio en Chrome).
export const tiktokDirecto = () => process.env.TIKTOK_DIRECT_POST === "1";

export async function publicarTikTok(video: Buffer, copy: string): Promise<string> {
  const token = await accessTokenTikTok();
  if (!token) throw new Falla("TikTok no está conectado");
  const auth = { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8" };

  const creador = await fetch(`${TIKTOK_API}/post/publish/creator_info/query/`, { method: "POST", headers: auth }).then((r) =>
    r.json()
  );
  if (creador?.error?.code !== "ok") throw new Falla(`TikTok: ${creador?.error?.message ?? "creator_info falló"}`);
  const opciones: string[] = creador.data?.privacy_level_options ?? [];
  const privacidad = opciones.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : opciones[0];
  if (privacidad !== "PUBLIC_TO_EVERYONE")
    throw new Falla("TikTok todavía no deja publicar en público desde la app (falta la aprobación)");

  // Trozos de 5–64 MB; el último absorbe el sobrante (hasta 128 MB).
  const CH = 32 * 1024 * 1024;
  const chunk = video.length <= 64 * 1024 * 1024 ? video.length : CH;
  const total = Math.max(1, Math.floor(video.length / chunk));

  const init = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      post_info: {
        title: copy.slice(0, 2200),
        privacy_level: privacidad,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: { source: "FILE_UPLOAD", video_size: video.length, chunk_size: chunk, total_chunk_count: total },
    }),
  }).then((r) => r.json());
  if (init?.error?.code !== "ok") throw new Falla(`TikTok: ${init?.error?.message ?? "init falló"}`);

  for (let i = 0; i < total; i++) {
    const ini = i * chunk;
    const fin = i === total - 1 ? video.length : ini + chunk;
    const r = await fetch(init.data.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${ini}-${fin - 1}/${video.length}`,
      },
      body: vista(video.subarray(ini, fin)),
    });
    if (!r.ok) throw new Falla(`TikTok: falló la subida (${r.status})`);
  }

  for (let i = 0; i < 60; i++) {
    await espera(5000);
    const st = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ publish_id: init.data.publish_id }),
    }).then((r) => r.json());
    const s = st?.data?.status;
    if (s === "PUBLISH_COMPLETE") {
      const idPost = st.data.publicaly_available_post_id?.[0];
      return idPost ? `https://www.tiktok.com/@roymata01/video/${idPost}` : "publicado (TikTok aún no da el link)";
    }
    if (s === "FAILED") throw new Falla(`TikTok no lo pudo publicar: ${st.data.fail_reason}`);
  }
  return "subido; TikTok lo sigue procesando";
}
