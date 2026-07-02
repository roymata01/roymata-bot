import type { ConversationStatus } from "@/types/database";

export const STATUS_CONFIG: Record<ConversationStatus, { label: string; className: string }> = {
  con_ia: { label: "Con IA", className: "bg-emerald-100 text-emerald-800 border-emerald-400" },
  por_atender: { label: "Por atender", className: "bg-red-100 text-red-800 border-red-400" },
  atendiendo: { label: "Atendiendo", className: "bg-orange-100 text-orange-800 border-orange-400" },
  apagada: { label: "Apagada", className: "bg-neutral-200 text-neutral-700 border-neutral-400" },
  cerrada: { label: "Cerrada", className: "bg-neutral-100 text-neutral-500 border-neutral-300" },
};

export const STATUS_ORDER: ConversationStatus[] = ["por_atender", "atendiendo", "con_ia", "apagada", "cerrada"];
