import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { NavLink } from "@/components/NavLink";
import {
  ChartIcon,
  ClipboardIcon,
  DocIcon,
  DollarIcon,
  FlaskIcon,
  InboxIcon,
  SlidersIcon,
  UsersIcon,
  ZapIcon,
} from "@/components/icons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)] text-[11px] font-bold text-white">
            V
          </span>
          <span className="text-[13px] font-semibold tracking-wide">VITA RESCUE</span>
          <span className="text-[13px] text-[var(--text-3)]">Inbox</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[var(--text-3)]">{user?.email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-[var(--border)] bg-[var(--surface)] p-2.5">
          <p className="label-xs px-2.5 pb-1.5 pt-2">General</p>
          <NavLink href="/resumen" icon={<ChartIcon />}>Resumen</NavLink>
          <NavLink href="/inbox" icon={<InboxIcon />}>Conversaciones</NavLink>
          <NavLink href="/crm" icon={<UsersIcon />}>CRM</NavLink>
          <NavLink href="/cotizaciones" icon={<ClipboardIcon />}>Cotizaciones</NavLink>
          <p className="label-xs px-2.5 pb-1.5 pt-4">Automatización</p>
          <NavLink href="/templates" icon={<DocIcon />}>Templates</NavLink>
          <NavLink href="/workflows" icon={<ZapIcon />}>Workflows</NavLink>
          <NavLink href="/personalizacion" icon={<SlidersIcon />}>Personalización</NavLink>
          <NavLink href="/probar-bot" icon={<FlaskIcon />}>Probar el bot</NavLink>
          <p className="label-xs px-2.5 pb-1.5 pt-4">Cuenta</p>
          <NavLink href="/costos" icon={<DollarIcon />}>Costos</NavLink>
        </nav>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
