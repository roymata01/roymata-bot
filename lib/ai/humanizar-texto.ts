// Estilo de chat de Roy aplicado POR CÓDIGO (2026-10-07): al modelo a veces
// se le escapa un acento o una mayúscula inicial; esto lo garantiza siempre.

/** Quita acentos (á→a, é→e...) pero respeta la ñ, emojis y URLs. */
export function quitarAcentos(texto: string): string {
  return texto
    .normalize("NFD")
    // la ñ/Ñ se descompone en n + ~ (U+0303): esa tilde se queda
    .replace(/[̀-̂̄-ͯ]/g, "")
    .normalize("NFC");
}

/** Minúscula al arranque del mensaje (sin tocar URLs ni mensajes-grito). */
export function minusculaInicial(texto: string): string {
  const t = texto.trimStart();
  if (!t || t.startsWith("http")) return texto;
  // un grito tipo "Brendaaa" o "ROOOY" se respeta tal cual
  if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]*([aeiou])\1\1/.test(t)) return texto;
  return t[0].toLowerCase() + t.slice(1);
}

export function humanizarTexto(texto: string): string {
  return minusculaInicial(quitarAcentos(texto));
}
