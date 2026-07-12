// Agrega el ref de rastreo (?r=...) a los links de registro dentro de un texto.
// Con esto, cada registro en la página queda ligado a la conversación/invitación
// de DM que lo generó — atribución real de conversiones del bot.
const DOMINIO = "hemorragias-vita.vercel.app";

export function conRef(texto: string, ref: string): string {
  return texto.replace(
    new RegExp(`https://${DOMINIO.replace(/\./g, "\\.")}/?([^\\s]*)`, "g"),
    (url) => {
      if (url.includes("r=")) return url;
      return url + (url.includes("?") ? "&" : "?") + "r=" + ref;
    }
  );
}
