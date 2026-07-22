import { createAdminClient } from "@/lib/supabase/admin";

// La API de perfil de Messenger (GET /{PSID}) está bloqueada sin App Review, pero
// la API de conversaciones de la Página SÍ devuelve el nombre de cada participante.
// Se cachea un mapa PSID->nombre y se rellenan los contactos que salían como número.
let cache: Map<string, string> | null = null;
let cacheAt = 0;
const TTL = 5 * 60_000;

async function mapaNombres(): Promise<Map<string, string>> {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const mapa = new Map<string, string>();
  let url: string | null =
    `https://graph.facebook.com/v21.0/me/conversations?fields=participants&limit=100&access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`;
  // pagina hasta agotar (tope de seguridad por si hay miles)
  for (let i = 0; url && i < 15; i++) {
    const res: Response = await fetch(url);
    if (!res.ok) break;
    const data: { data?: { participants?: { data?: { id: string; name: string }[] } }[]; paging?: { next?: string } } =
      await res.json();
    for (const conv of data.data ?? []) {
      for (const p of conv.participants?.data ?? []) {
        if (p.id !== process.env.FB_PAGE_ID && p.name) mapa.set(p.id, p.name);
      }
    }
    url = data.paging?.next ?? null;
  }
  cache = mapa;
  cacheAt = Date.now();
  return mapa;
}

// Devuelve el nombre real de un contacto de Messenger por su PSID (o null).
export async function nombreMessenger(psid: string): Promise<string | null> {
  try {
    return (await mapaNombres()).get(psid) ?? null;
  } catch {
    return null;
  }
}

// Rellena en Supabase los nombres de todos los contactos de Messenger que
// están como número. Se usa en el llenado masivo y se puede correr en el cron.
export async function rellenarNombresMessenger(): Promise<{ actualizados: number }> {
  const supabase = createAdminClient();
  const { data: contactos } = await supabase
    .from("contacts")
    .select("id, external_id, display_name")
    .eq("channel", "messenger");

  const mapa = await mapaNombres();
  let actualizados = 0;
  for (const c of contactos ?? []) {
    const nombre = mapa.get(c.external_id);
    if (nombre && c.display_name !== nombre) {
      await supabase.from("contacts").update({ display_name: nombre }).eq("id", c.id);
      actualizados++;
    }
  }
  return { actualizados };
}
