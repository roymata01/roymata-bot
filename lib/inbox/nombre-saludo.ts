import { createAdminClient } from "@/lib/supabase/admin";
import { nombreDesdeUsername } from "@/lib/ai/name-from-username";

// Nombre para saludar a un contacto (regla de Roy: nunca el username crudo):
// - Facebook guarda el nombre real -> primer nombre
// - Instagram guarda "@usuario" -> la IA extrae el nombre si es obvio
// - números o nada reconocible -> null (se saluda sin nombre)
export async function nombreDelContacto(contactId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("contacts").select("display_name").eq("id", contactId).single();
  const dn = data?.display_name?.trim() ?? null;
  if (!dn || /^\d+$/.test(dn)) return null;
  return dn.startsWith("@") ? await nombreDesdeUsername(dn.slice(1)) : dn.split(/\s+/)[0];
}

// Falta de dedo creíble: intercambia dos letras vecinas del nombre
// ("Eduardo" -> "Edaurdo", "Roy" -> "Ryo"). Usar solo con nombres de 3+ letras.
export function typoEnNombre(nombre: string): string {
  const i = 1 + Math.floor(Math.random() * (nombre.length - 2));
  return nombre.slice(0, i) + nombre[i + 1] + nombre[i] + nombre.slice(i + 2);
}
