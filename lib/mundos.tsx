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

export type Item = { href: string; label: string; icon: React.ReactNode };
export type Mundo = {
  id: string;
  nombre: string;
  desc: string;
  color: string; // acento del mundo (para el launcher)
  home: string; // a dónde entra al elegirlo
  items: Item[]; // lo que muestra su menú
};

// La estructura del sistema por mundos. Al elegir un mundo, el menú (sidebar y
// tabs del cel) solo muestra sus items. Agregar cosas = agregar un item aquí.
export const MUNDOS: Mundo[] = [
  {
    id: "vita",
    nombre: "Trabajo — VITA",
    desc: "Conversaciones, CRM, cotizaciones y métricas del negocio",
    color: "#1a56db",
    home: "/inicio",
    items: [
      { href: "/inicio", label: "Inicio", icon: <ChartIcon /> },
      { href: "/inbox", label: "Conversaciones", icon: <InboxIcon /> },
      { href: "/crm", label: "CRM", icon: <UsersIcon /> },
      { href: "/cotizaciones", label: "Cotizaciones", icon: <ClipboardIcon /> },
      { href: "/resumen", label: "Métricas", icon: <ChartIcon /> },
    ],
  },
  {
    id: "bot",
    nombre: "El Bot",
    desc: "Personalización, templates, workflows y costos de la IA",
    color: "#7c3aed",
    home: "/personalizacion",
    items: [
      { href: "/personalizacion", label: "Personalización", icon: <SlidersIcon /> },
      { href: "/templates", label: "Templates", icon: <DocIcon /> },
      { href: "/workflows", label: "Workflows", icon: <ZapIcon /> },
      { href: "/probar-bot", label: "Probar el bot", icon: <FlaskIcon /> },
      { href: "/costos", label: "Costos de IA", icon: <DollarIcon /> },
    ],
  },
  {
    id: "personal",
    nombre: "Personal",
    desc: "Tus finanzas y la facturación de tus tickets",
    color: "#16a34a",
    home: "/finanzas",
    items: [
      { href: "/finanzas", label: "Finanzas", icon: <WalletIcon /> },
      { href: "/facturacion", label: "Facturación", icon: <ReceiptIcon /> },
    ],
  },
];

// Qué mundo contiene una ruta dada (para resaltar y para el shell).
export function mundoDeRuta(pathname: string): Mundo | null {
  return (
    MUNDOS.find((m) => m.items.some((i) => i.href === pathname || pathname.startsWith(i.href + "/"))) ?? null
  );
}
