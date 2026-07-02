"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold transition ${
        active ? "border-black bg-black text-white" : "border-transparent hover:border-black/30"
      }`}
    >
      {children}
    </Link>
  );
}
