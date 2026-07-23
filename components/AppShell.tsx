"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MUNDOS, mundoDeRuta, type Mundo } from "@/lib/mundos";
import { NavLink } from "@/components/NavLink";
import { SignOutButton } from "@/components/SignOutButton";
import { ChevronLeftIcon, GridIcon } from "@/components/icons";

export function AppShell({ email, children }: { email?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mundo, setMundo] = useState<Mundo | null>(null);

  // el mundo activo: primero el de la ruta actual, si no el guardado
  useEffect(() => {
    const porRuta = mundoDeRuta(pathname);
    if (porRuta) {
      setMundo(porRuta);
      try {
        localStorage.setItem("mundo", porRuta.id);
      } catch {}
      return;
    }
    try {
      const guardado = localStorage.getItem("mundo");
      setMundo(MUNDOS.find((m) => m.id === guardado) ?? MUNDOS[0]);
    } catch {
      setMundo(MUNDOS[0]);
    }
  }, [pathname]);

  // el launcher y el menú móvil van a pantalla completa, sin el shell
  if (pathname === "/hub" || pathname === "/menu") return <>{children}</>;

  const items = mundo?.items ?? [];
  const tituloActual = items.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))?.label ?? mundo?.nombre;

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {/* botón de atrás: siempre visible en el cel */}
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-2)] hover:bg-[var(--hover)] md:hidden"
            aria-label="Atrás"
          >
            <ChevronLeftIcon size={20} />
          </button>
          <Link href="/hub" className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ backgroundColor: mundo?.color ?? "var(--accent)" }}>
              V
            </span>
            <span className="truncate text-[13px] font-semibold text-[var(--text)]">{tituloActual}</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/hub" className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--hover)]">
            <GridIcon size={16} />
            <span className="hidden sm:inline">Cambiar</span>
          </Link>
          <span className="hidden text-[13px] text-[var(--text-3)] md:inline">{email}</span>
          <div className="hidden md:block">
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* sidebar del mundo activo — solo escritorio */}
        <nav className="hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] p-2.5 md:flex">
          <p className="label-xs px-2.5 pb-1.5 pt-2">{mundo?.nombre}</p>
          {items.map((i) => (
            <NavLink key={i.href} href={i.href} icon={i.icon}>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1 overflow-hidden pb-16 md:pb-0">{children}</div>
      </div>

      {/* tabs del mundo activo — solo cel */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.slice(0, 5).map((i) => {
          const activo = pathname === i.href || pathname.startsWith(i.href + "/");
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                activo ? "text-[var(--accent)]" : "text-[var(--text-3)]"
              }`}
            >
              <span className="[&_svg]:h-5 [&_svg]:w-5">{i.icon}</span>
              <span className="max-w-full truncate px-0.5">{i.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
