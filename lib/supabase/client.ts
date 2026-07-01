import { createBrowserClient } from "@supabase/ssr";

// Cliente para componentes de cliente ("use client") en el panel.
// Respeta RLS según la sesión del usuario autenticado.
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
