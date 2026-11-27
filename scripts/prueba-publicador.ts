// Prueba en seco del publicador: info del video + transcripción + copys.
// NO publica ni manda nada. Uso:
//   npx tsx --env-file=.env.local scripts/prueba-publicador.ts <video.mp4> ["cambio a los copys"]
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { infoMp4 } from "@/lib/publicador/mp4-info";
import { transcribir, escribirCopys, editarCopys } from "@/lib/publicador/copy";
import { redesPedidas } from "@/lib/publicador/flujo";

async function main() {
  const ruta = process.argv[2];
  const video = readFileSync(ruta);
  const info = infoMp4(video);
  console.log("info:", info);
  const texto = await transcribir(video, basename(ruta), "video/mp4");
  console.log("transcripción:", texto.slice(0, 300));
  const copys = await escribirCopys({ transcripcion: texto, nota: null, nombreArchivo: basename(ruta), info });
  console.log(JSON.stringify(copys, null, 2));
  if (process.argv[3]) {
    console.log("cambio:", JSON.stringify(await editarCopys({ copys, instruccion: process.argv[3], transcripcion: texto, info }), null, 2));
  }
  console.log("no-cambio:", await editarCopys({ copys, instruccion: "oye y mañana a qué hora es la junta?", transcripcion: texto, info }));
  for (const t of ["publicar", "Publícalo sin tiktok", "publicar solo en ig y youtube", "publicar en facebook"]) console.log(t, "→", redesPedidas(t));
}
main();
