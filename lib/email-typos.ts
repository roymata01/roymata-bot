// Detección de typos comunes en correos (gmail.con, hotmial.com, yaho.com...).
// Nació de 4 casos reales de alumnas que pagaron con el correo mal escrito y
// nunca recibieron nada: Ingrid (.con), Marta, Silvia y Maricela.

const DOMINIOS_BUENOS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "yahoo.com.mx",
  "icloud.com",
  "live.com",
  "live.com.mx",
  "protonmail.com",
  "aol.com",
];

// Typos directos que se ven seguido (no requieren distancia de edición)
const TYPOS_DIRECTOS: Record<string, string> = {
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.comm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.cm": "gmail.com",
  "hotmail.con": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "outlook.con": "outlook.com",
  "outlok.com": "outlook.com",
  "yahoo.con": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahho.com": "yahoo.com",
  "icloud.con": "icloud.com",
  "icloud.co": "icloud.com",
  "live.con": "live.com",
};

function distancia1(a: string, b: string): boolean {
  // ¿a y b difieren en exactamente 1 edición (cambio, alta o baja de letra)?
  if (a === b) return false;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (largo.length - corto.length > 1) return false;
  let i = 0, j = 0, difs = 0;
  while (i < corto.length && j < largo.length) {
    if (corto[i] === largo[j]) { i++; j++; continue; }
    difs++;
    if (difs > 1) return false;
    if (corto.length === largo.length) { i++; j++; }
    else j++;
  }
  return difs + (largo.length - j) <= 1;
}

/** Si el correo parece tener un typo en el dominio, devuelve la versión
 * corregida sugerida; si se ve bien (o no hay sugerencia clara), null. */
export function sugerirCorreo(email: string): string | null {
  const limpio = email.trim().toLowerCase();
  const arroba = limpio.lastIndexOf("@");
  if (arroba < 1) return null;
  const local = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);

  if (DOMINIOS_BUENOS.includes(dominio)) return null;

  if (TYPOS_DIRECTOS[dominio]) return `${local}@${TYPOS_DIRECTOS[dominio]}`;

  for (const bueno of DOMINIOS_BUENOS) {
    if (distancia1(dominio, bueno)) return `${local}@${bueno}`;
  }
  return null;
}
