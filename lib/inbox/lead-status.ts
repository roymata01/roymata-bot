import type { LeadStatus } from "@/types/database";

export const LEAD_STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  interesado: { label: "Interesado", className: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  registrado: { label: "Registrado", className: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  sin_interes: { label: "Sin interés", className: "bg-white/10 text-slate-400 border-white/20" },
  cliente: { label: "Cliente", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
};

export const LEAD_STATUS_ORDER: LeadStatus[] = ["interesado", "registrado", "cliente", "sin_interes"];
