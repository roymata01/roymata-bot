import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { NavLink } from "@/components/NavLink";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex h-screen flex-col bg-[#F5F1E8]">
      <header className="flex items-center justify-between border-b-2 border-black bg-[#F5F1E8] px-5 py-3">
        <h1 className="text-lg font-bold">VITA RESCUE INBOX</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-600">{user?.email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-48 shrink-0 flex-col gap-1 border-r-2 border-black bg-[#FAF8F2] p-3">
          <NavLink href="/inbox">Conversaciones</NavLink>
          <NavLink href="/personalizacion">Personalización</NavLink>
          <NavLink href="/templates">Templates</NavLink>
        </nav>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
