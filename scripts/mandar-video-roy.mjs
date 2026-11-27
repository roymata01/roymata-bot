#!/usr/bin/env node
// RUTA A de la cadenita del publicador (27-nov-2026).
// Cuando una sesión de Claude termina un video para Roy, esto:
//   1. lo guarda (en partes de 45 MB) en el bucket privado "publicaciones" de Supabase,
//   2. lo sube al WhatsApp del bot (documento si pesa ≤16 MB; si no, una vista previa
//      de ≤16 MB para verlo en el teléfono — el HD se queda guardado para publicar),
//   3. crea la fila en la tabla publicaciones con los copys (si se los pasas),
//   4. le pide al bot que se lo mande a Roy (o que le avise por plantilla si la
//      ventana de 24 h está cerrada). Roy contesta "publicar" y el bot publica.
//
// Uso:
//   node ~/roymata-bot/scripts/mandar-video-roy.mjs <video.mp4> [copy.json] [--nota "texto"] [--probar]
// copy.json = el mismo formato de la skill publicar:
//   {"instagram": "...", "facebook": "...", "youtube": {"titulo","descripcion","etiquetas"}, "tiktok": "..."}
// Sin copy.json el bot transcribe el video y escribe los copys él solo.
// --probar: revisa el video y las llaves sin subir ni mandar nada.

import { readFileSync, statSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";
import { homedir, tmpdir } from "node:os";

const BOT = process.env.BOT_URL || "https://sistema.vitarescue.com.mx";
const REMOTION = join(homedir(), "remotion-video/node_modules/@remotion/compositor-darwin-arm64");
const FFENV = { ...process.env, DYLD_LIBRARY_PATH: REMOTION };
const PARTE = 45 * 1024 * 1024;
const MAX_GUARDADO = 95 * 1024 * 1024; // lo que se guarda y se publica
const MAX_WA_VIDEO = 16 * 1024 * 1024; // límite de WhatsApp Cloud API para video

function env() {
  const datos = {};
  for (const l of readFileSync(join(homedir(), "roymata-bot/.env.local"), "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) datos[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return datos;
}

function info(ruta) {
  const s = JSON.parse(
    execFileSync(join(REMOTION, "ffprobe"), [
      "-v", "error", "-select_streams", "v:0", "-show_entries",
      "stream=width,height:stream_side_data=rotation:format=duration,size", "-of", "json", ruta,
    ], { env: FFENV }).toString()
  );
  let { width: w, height: h } = s.streams[0];
  const rot = Math.abs(Number((s.streams[0].side_data_list ?? []).find((d) => d.rotation != null)?.rotation ?? 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  return { duracion: Math.round(Number(s.format.duration) * 10) / 10, ancho: w, alto: h, bytes: Number(s.format.size) };
}

/** Recomprime para que pese ≤ objetivo (bitrate calculado por duración). */
function comprimir(ruta, duracion, objetivo, salida, maxLado) {
  const kbps = Math.max(300, Math.floor((objetivo * 8) / 1024 / duracion) - 128 - 50);
  execFileSync(join(REMOTION, "ffmpeg"), [
    "-y", "-v", "error", "-i", ruta,
    "-vf", `scale='if(gt(iw,ih),min(${maxLado},iw),-2)':'if(gt(iw,ih),-2,min(${maxLado},ih))'`,
    "-c:v", "libx264", "-preset", "medium", "-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`,
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", salida,
  ], { env: FFENV, stdio: "inherit" });
  return salida;
}

async function main() {
  const args = process.argv.slice(2);
  const probar = args.includes("--probar");
  const iNota = args.indexOf("--nota");
  const nota = iNota >= 0 ? args[iNota + 1] : null;
  const sueltos = args.filter((a, i) => !a.startsWith("--") && !(iNota >= 0 && i === iNota + 1));
  const [video, copyRuta] = sueltos;
  if (!video || !existsSync(video)) {
    console.error("Uso: mandar-video-roy.mjs <video.mp4> [copy.json] [--nota \"texto\"] [--probar]");
    process.exit(1);
  }
  const E = env();
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "CRON_SECRET"])
    if (!E[k]) throw new Error(`falta ${k} en ~/roymata-bot/.env.local`);
  const copy = copyRuta ? JSON.parse(readFileSync(copyRuta, "utf8")) : null;
  const nombre = basename(video);
  const i = info(video);
  console.log(`Video: ${nombre} · ${i.duracion} s · ${(i.bytes / 1048576).toFixed(1)} MB · ${i.ancho}x${i.alto}`);
  if (copy) console.log(`Copys: ${Object.keys(copy).join(", ")}`);
  else console.log("Sin copy.json: el bot transcribe y escribe los copys.");
  if (probar) return console.log("Prueba terminada, no se subió ni mandó nada.");

  const tmp = mkdtempSync(join(tmpdir(), "mandar-roy-"));
  try {
    // 1. lo que se publica: el original, o ≤95 MB si pesa más (límite práctico del bot)
    let hd = video;
    if (statSync(video).size > MAX_GUARDADO) {
      console.log("Pesa más de 95 MB: saco una copia de ~90 MB para publicar…");
      hd = comprimir(video, i.duracion, 90 * 1024 * 1024, join(tmp, "hd.mp4"), 1920);
    }
    const bytes = readFileSync(hd);

    // 2. lo que ve Roy en WhatsApp
    let waRuta = hd;
    let tipoWa = "document";
    if (bytes.length > MAX_WA_VIDEO) {
      console.log("Para WhatsApp saco una vista previa de ~15 MB (el HD queda guardado para publicar)…");
      waRuta = comprimir(hd, i.duracion, 15 * 1024 * 1024, join(tmp, "wa.mp4"), 1280);
      tipoWa = "video";
    }
    const fd = new FormData();
    fd.set("messaging_product", "whatsapp");
    fd.set("type", "video/mp4");
    fd.set("file", new Blob([readFileSync(waRuta)], { type: "video/mp4" }), nombre);
    const up = await fetch(`https://graph.facebook.com/v21.0/${E.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${E.WHATSAPP_ACCESS_TOKEN}` },
      body: fd,
    }).then((r) => r.json());
    if (!up.id) throw new Error(`WhatsApp no aceptó el video: ${JSON.stringify(up).slice(0, 300)}`);

    // 3. fila
    const sb = { apikey: E.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}` };
    const fila = await fetch(`${E.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/publicaciones`, {
      method: "POST",
      headers: { ...sb, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        origen: "mac",
        estado: "recibido",
        nombre_archivo: nombre,
        mime: "video/mp4",
        bytes: bytes.length,
        partes: Math.ceil(bytes.length / PARTE),
        duracion: i.duracion,
        ancho: i.ancho,
        alto: i.alto,
        wa_media_id: up.id,
        nota_roy: nota,
        copy,
        wa_tipo: tipoWa,
      }),
    }).then((r) => r.json());
    const id = fila?.[0]?.id;
    if (!id) throw new Error(`No pude crear la fila: ${JSON.stringify(fila).slice(0, 300)}`);

    // 4. partes al bucket privado
    for (let p = 0; p * PARTE < bytes.length; p++) {
      const r = await fetch(
        `${E.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/publicaciones/${id}/parte-${String(p).padStart(3, "0")}`,
        {
          method: "POST",
          headers: { ...sb, "Content-Type": "application/octet-stream", "x-upsert": "true" },
          body: bytes.subarray(p * PARTE, Math.min(bytes.length, (p + 1) * PARTE)),
        }
      );
      if (!r.ok) throw new Error(`No pude guardar la parte ${p + 1}: ${r.status} ${await r.text()}`);
    }

    // 5. que el bot se lo mande a Roy
    const av = await fetch(`${BOT}/api/publicaciones/avisar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${E.CRON_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).then((r) => r.json());
    if (!av.ok) throw new Error(`El bot no pudo avisarle a Roy: ${av.error}`);
    console.log(
      av.como === "enviado"
        ? `Listo: Roy ya tiene el video y los copys en WhatsApp (publicación ${id}). Falta que conteste "publicar".`
        : `Listo: la ventana de WhatsApp estaba cerrada, le llegó un aviso. En cuanto Roy conteste le llegan el video y los copys (publicación ${id}).`
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});
