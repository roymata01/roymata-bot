import type { ConversationStatus } from "@/types/database";

export const STATUS_CONFIG: Record<ConversationStatus, { label: string; dot: string }> = {
  con_ia: { label: "Con IA", dot: "#46b380" },
  por_atender: { label: "Por atender", dot: "#e5484d" },
  atendiendo: { label: "Atendiendo", dot: "#f0b429" },
  apagada: { label: "Apagada", dot: "#62676f" },
  cerrada: { label: "Cerrada", dot: "#43464c" },
};

export const STATUS_ORDER: ConversationStatus[] = ["por_atender", "atendiendo", "con_ia", "apagada", "cerrada"];
