"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
        active
          ? "bg-white/[0.07] text-[var(--text)]"
          : "text-[var(--text-2)] hover:bg-white/[0.04] hover:text-[var(--text)]"
      }`}
    >
      {icon && <span className={active ? "text-[var(--accent)]" : "text-[var(--text-3)]"}>{icon}</span>}
      {children}
    </Link>
  );
}
