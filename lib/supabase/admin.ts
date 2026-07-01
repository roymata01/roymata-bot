import { createClient } from "@supabase/supabase-js";

// Cliente con service_role: ignora RLS. Úsalo solo en código de servidor
// (webhooks, rutas API, cron jobs) — nunca lo importes en un componente cliente.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
