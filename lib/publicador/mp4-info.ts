// Duración, tamaño y orientación de un MP4/MOV leyendo sus cajas (moov →
// mvhd/tkhd). En Vercel no hay ffprobe, y esto es lo único que hace falta
// para decidir reel vs video y si va #Shorts.

export type InfoVideo = {
  duracion: number; // segundos (1 decimal)
  ancho: number;
  alto: number;
  vertical: boolean;
  mb: number;
};

type Caja = { tipo: string; inicio: number; datos: number; fin: number };

function cajas(buf: Buffer, desde: number, hasta: number): Caja[] {
  const out: Caja[] = [];
  let p = desde;
  while (p + 8 <= hasta) {
    let tam = buf.readUInt32BE(p);
    const tipo = buf.toString("latin1", p + 4, p + 8);
    let cab = 8;
    if (tam === 1) {
      tam = Number(buf.readBigUInt64BE(p + 8));
      cab = 16;
    } else if (tam === 0) {
      tam = hasta - p;
    }
    if (tam < cab || p + tam > hasta) break;
    out.push({ tipo, inicio: p, datos: p + cab, fin: p + tam });
    p += tam;
  }
  return out;
}

const hijo = (buf: Buffer, c: Caja, tipo: string) => cajas(buf, c.datos, c.fin).find((x) => x.tipo === tipo);

export function infoMp4(buf: Buffer): InfoVideo | null {
  try {
    const moov = cajas(buf, 0, buf.length).find((c) => c.tipo === "moov");
    if (!moov) return null;

    let duracion = 0;
    const mvhd = hijo(buf, moov, "mvhd");
    if (mvhd) {
      const v = buf.readUInt8(mvhd.datos);
      const escala = v === 1 ? buf.readUInt32BE(mvhd.datos + 20) : buf.readUInt32BE(mvhd.datos + 12);
      const dur = v === 1 ? Number(buf.readBigUInt64BE(mvhd.datos + 24)) : buf.readUInt32BE(mvhd.datos + 16);
      if (escala) duracion = dur / escala;
    }

    let ancho = 0;
    let alto = 0;
    for (const trak of cajas(buf, moov.datos, moov.fin).filter((c) => c.tipo === "trak")) {
      const mdia = hijo(buf, trak, "mdia");
      const hdlr = mdia && hijo(buf, mdia, "hdlr");
      if (!hdlr || buf.toString("latin1", hdlr.datos + 8, hdlr.datos + 12) !== "vide") continue;
      const tkhd = hijo(buf, trak, "tkhd");
      if (!tkhd) continue;
      const v = buf.readUInt8(tkhd.datos);
      const m = tkhd.datos + (v === 1 ? 52 : 40); // matriz 3x3 (16.16)
      const a = buf.readInt32BE(m);
      const b = buf.readInt32BE(m + 4);
      const w = buf.readUInt32BE(m + 36) / 65536;
      const h = buf.readUInt32BE(m + 40) / 65536;
      const girado = a === 0 && Math.abs(b) === 65536; // 90° o 270°
      ancho = Math.round(girado ? h : w);
      alto = Math.round(girado ? w : h);
      break;
    }

    return {
      duracion: Math.round(duracion * 10) / 10,
      ancho,
      alto,
      vertical: alto > ancho,
      mb: Math.round((buf.length / 1_048_576) * 10) / 10,
    };
  } catch (e) {
    console.error("infoMp4:", e);
    return null;
  }
}
