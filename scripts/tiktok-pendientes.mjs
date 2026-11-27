#!/usr/bin/env node
// TikTok desde la Mac mientras TikTok no apruebe la app (27-nov-2026).
// Cuando Roy dice "publicar" por WhatsApp, el bot sube IG/FB/YouTube y deja
// TikTok "pendiente para la Mac". Esto los baja para que la skill publicar
// los suba en TikTok Studio con Chrome.
//
//   node ~/roymata-bot/scripts/tiktok-pendientes.mjs            → lista y baja los pendientes
//   node ~/roymata-bot/scripts/tiktok-pendientes.mjs hecho <id> <link>   → lo marca publicado
//   node ~/roymata-bot/scripts/tiktok-pendientes.mjs omitir <id>         → Roy no lo quiere en TikTok

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const E = {};
for (const l of readFileSync(join(homedir(), "roymata-bot/.env.local"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = E.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: E.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}` };
const ruta = (id, i) => `${id}/parte-${String(i).padStart(3, "0")}`;

async function fila(id) {
  const r = await fetch(`${URL}/rest/v1/publicaciones?id=eq.${id}&select=*`, { headers: H }).then((r) => r.json());
  if (!r[0]) throw new Error(`no existe la publicación ${id}`);
  return r[0];
}

async function guardar(id, cambios) {
  const r = await fetch(`${URL}/rest/v1/publicaciones?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ ...cambios, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`no pude guardar: ${await r.text()}`);
}

async function borrarSiYaNoSeOcupa(p, resultados) {
  const faltan = Object.values(resultados).some((x) => !x.ok && !x.omitido);
  if (faltan || p.archivo_borrado_at) return;
  const prefijos = Array.from({ length: p.partes || 1 }, (_, i) => ruta(p.id, i));
  await fetch(`${URL}/storage/v1/object/publicaciones`, {
    method: "DELETE",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: prefijos }),
  });
  await guardar(p.id, { archivo_borrado_at: new Date().toISOString() });
}

async function main() {
  const [accion, id, link] = process.argv.slice(2);
  if (accion === "hecho" || accion === "omitir") {
    const p = await fila(id);
    const resultados = { ...p.resultados };
    resultados.tiktok =
      accion === "hecho"
        ? { ok: true, link, at: new Date().toISOString(), por: "mac" }
        : { ok: false, omitido: true, at: new Date().toISOString() };
    await guardar(id, { resultados });
    await borrarSiYaNoSeOcupa(p, resultados);
    return console.log(`Listo: TikTok ${accion === "hecho" ? "publicado" : "omitido"} en ${p.nombre_archivo}`);
  }

  const lista = await fetch(
    `${URL}/rest/v1/publicaciones?select=*&resultados->tiktok->>pendiente=eq.mac&archivo_borrado_at=is.null&order=created_at`,
    { headers: H }
  ).then((r) => r.json());
  if (!lista.length) return console.log("No hay videos pendientes de TikTok.");
  for (const p of lista) {
    const dir = join(homedir(), "publicador/trabajo", `tiktok-${p.id.slice(0, 8)}`);
    mkdirSync(dir, { recursive: true });
    const trozos = [];
    for (let i = 0; i < (p.partes || 1); i++) {
      const r = await fetch(`${URL}/storage/v1/object/publicaciones/${ruta(p.id, i)}`, { headers: H });
      if (!r.ok) throw new Error(`no pude bajar la parte ${i + 1} de ${p.nombre_archivo}`);
      trozos.push(Buffer.from(await r.arrayBuffer()));
    }
    const video = join(dir, p.nombre_archivo?.replace(/[^\w.-]+/g, "_") || "video.mp4");
    writeFileSync(video, Buffer.concat(trozos));
    console.log(`\n● ${p.nombre_archivo}  (id ${p.id})\n  video: ${video}\n  copy TikTok: ${p.copy?.tiktok ?? "(sin copy)"}`);
  }
  console.log("\nAl terminar cada uno: tiktok-pendientes.mjs hecho <id> <link>");
}

main().catch((e) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});
