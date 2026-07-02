import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { NavLink } from "@/components/NavLink";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex h-screen flex-col bg-[#0B1220]">
      <header className="flex items-center justify-between border-b-2 border-white/10 bg-[#0B1220] px-5 py-3">
        <h1 className="text-lg font-bold">VITA RESCUE INBOX</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">{user?.email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-48 shrink-0 flex-col gap-1 border-r-2 border-white/10 bg-[#0F1729] p-3">
          <NavLink href="/resumen">Resumen</NavLink>
          <NavLink href="/inbox">Conversaciones</NavLink>
          <NavLink href="/crm">CRM</NavLink>
          <NavLink href="/templates">Templates</NavLink>
          <NavLink href="/workflows">Workflows</NavLink>
          <NavLink href="/personalizacion">Personalización</NavLink>
          <NavLink href="/costos">Costos</NavLink>
        </nav>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
