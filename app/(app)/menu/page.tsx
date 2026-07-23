"use client";

import Link from "next/link";
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
import { SignOutButton } from "@/components/SignOutButton";

// Hub del teléfono (tab "Más"): todo el sistema agrupado por mundos.
const GRUPOS: { titulo: string; items: { href: string; label: string; icon: React.ReactNode; desc: string }[] }[] = [
  {
    titulo: "VITA — El negocio",
    items: [
      { href: "/inicio", label: "Inicio", icon: <ChartIcon />, desc: "El resumen de tu día" },
      { href: "/inbox", label: "Conversaciones", icon: <InboxIcon />, desc: "Instagram, Facebook y el bot" },
      { href: "/crm", label: "CRM", icon: <UsersIcon />, desc: "Contactos, etiquetas y leads" },
      { href: "/cotizaciones", label: "Cotizaciones", icon: <ClipboardIcon />, desc: "Solicitudes de empresas y grupos" },
      { href: "/resumen", label: "Métricas", icon: <ChartIcon />, desc: "Números del inbox" },
    ],
  },
  {
    titulo: "El bot",
    items: [
      { href: "/personalizacion", label: "Personalización", icon: <SlidersIcon />, desc: "Conocimiento y comportamiento" },
      { href: "/templates", label: "Templates", icon: <DocIcon />, desc: "Mensajes reutilizables" },
      { href: "/workflows", label: "Workflows", icon: <ZapIcon />, desc: "Reglas automáticas" },
      { href: "/probar-bot", label: "Probar el bot", icon: <FlaskIcon />, desc: "Chat de prueba sin clientes" },
      { href: "/costos", label: "Costos de IA", icon: <DollarIcon />, desc: "Gasto de Claude" },
    ],
  },
  {
    titulo: "Personal",
    items: [
      { href: "/finanzas", label: "Finanzas", icon: <WalletIcon />, desc: "Tu dinero" },
      { href: "/facturacion", label: "Facturación", icon: <ReceiptIcon />, desc: "Tickets → facturas CFDI" },
    ],
  },
];

export default function MenuPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="page-title">Todo el sistema</h2>
          <SignOutButton />
        </div>
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="flex flex-col gap-2">
            <p className="label-xs">{g.titulo}</p>
            <div className="flex flex-col gap-2">
              {g.items.map((i) => (
                <Link key={i.href + i.label} href={i.href} className="card flex items-center gap-3 p-3.5 transition hover:border-white/20">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--text-2)]">
                    {i.icon}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[14px] font-semibold">{i.label}</span>
                    <span className="text-[12px] text-[var(--text-3)]">{i.desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
