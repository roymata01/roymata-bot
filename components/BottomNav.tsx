"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, ChatIcon, UsersIcon, WalletIcon, MenuIcon } from "@/components/icons";

// Barra de navegación inferior para el teléfono (estilo app nativa).
// En computadora se oculta y manda el menú lateral.
const TABS = [
  { href: "/inicio", label: "Inicio", icon: ChartIcon },
  { href: "/inbox", label: "Chats", icon: ChatIcon },
  { href: "/crm", label: "CRM", icon: UsersIcon },
  { href: "/finanzas", label: "Finanzas", icon: WalletIcon },
  { href: "/menu", label: "Más", icon: MenuIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const activo = pathname === href || (href !== "/inicio" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              activo ? "text-[var(--accent)]" : "text-[var(--text-3)]"
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
