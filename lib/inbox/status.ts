import type { ConversationStatus } from "@/types/database";

export const STATUS_CONFIG: Record<ConversationStatus, { label: string; className: string }> = {
  con_ia: { label: "Con IA", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  por_atender: { label: "Por atender", className: "bg-red-500/15 text-red-300 border-red-500/40" },
  atendiendo: { label: "Atendiendo", className: "bg-orange-500/15 text-orange-300 border-orange-500/40" },
  apagada: { label: "Apagada", className: "bg-white/10 text-slate-300 border-white/20" },
  cerrada: { label: "Cerrada", className: "bg-white/5 text-slate-500 border-white/10" },
};

export const STATUS_ORDER: ConversationStatus[] = ["por_atender", "atendiendo", "con_ia", "apagada", "cerrada"];
