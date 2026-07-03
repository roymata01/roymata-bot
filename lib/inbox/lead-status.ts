import type { LeadStatus } from "@/types/database";

export const LEAD_STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  interesado: { label: "Interesado", className: "bg-[#f0b429]/10 text-[#f0b429] border-[#f0b429]/25" },
  registrado: { label: "Registrado", className: "bg-[#4e9cf5]/10 text-[#4e9cf5] border-[#4e9cf5]/25" },
  sin_interes: { label: "Sin interés", className: "bg-white/[0.06] text-[var(--text-3)] border-white/10" },
  cliente: { label: "Cliente", className: "bg-[#46b380]/10 text-[#46b380] border-[#46b380]/25" },
};

export const LEAD_STATUS_ORDER: LeadStatus[] = ["interesado", "registrado", "cliente", "sin_interes"];
