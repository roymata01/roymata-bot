import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para Server Components / Route Handlers del panel.
// Lee la sesión del usuario desde las cookies y respeta RLS.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // se llama desde un Server Component sin permiso de escritura;
            // el middleware de sesión se encarga de refrescar las cookies.
          }
        },
      },
    }
  );
}
