import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { NavLink } from "@/components/NavLink";
import { BottomNav } from "@/components/BottomNav";
import {
  ChartIcon,
  ClipboardIcon,
  DocIcon,
  DollarIcon,
  FlaskIcon,
  InboxIcon,
  ReceiptIcon,
  SlidersIcon,
  UsersIcon,
  WalletIcon,
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
          <span className="hidden text-[13px] text-[var(--text-3)] sm:inline">Sistema</span>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <span className="text-[13px] text-[var(--text-3)]">{user?.email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {/* menú lateral: solo en computadora; en el cel manda la barra de abajo */}
        <nav className="hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] p-2.5 md:flex">
          <NavLink href="/inicio" icon={<ChartIcon />}>Inicio</NavLink>
          <p className="label-xs px-2.5 pb-1.5 pt-4">VITA — El negocio</p>
          <NavLink href="/inbox" icon={<InboxIcon />}>Conversaciones</NavLink>
          <NavLink href="/crm" icon={<UsersIcon />}>CRM</NavLink>
          <NavLink href="/cotizaciones" icon={<ClipboardIcon />}>Cotizaciones</NavLink>
          <NavLink href="/resumen" icon={<ChartIcon />}>Métricas</NavLink>
          <p className="label-xs px-2.5 pb-1.5 pt-4">El bot</p>
          <NavLink href="/personalizacion" icon={<SlidersIcon />}>Personalización</NavLink>
          <NavLink href="/templates" icon={<DocIcon />}>Templates</NavLink>
          <NavLink href="/workflows" icon={<ZapIcon />}>Workflows</NavLink>
          <NavLink href="/probar-bot" icon={<FlaskIcon />}>Probar el bot</NavLink>
          <NavLink href="/costos" icon={<DollarIcon />}>Costos de IA</NavLink>
          <p className="label-xs px-2.5 pb-1.5 pt-4">Personal</p>
          <NavLink href="/finanzas" icon={<WalletIcon />}>Finanzas</NavLink>
          <NavLink href="/facturacion" icon={<ReceiptIcon />}>Facturación</NavLink>
        </nav>
        {/* pb en móvil para que la barra inferior no tape el contenido */}
        <div className="flex-1 overflow-hidden pb-14 md:pb-0">{children}</div>
      </div>
      <BottomNav />
    </div>
  );
}
