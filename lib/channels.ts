import type { Channel } from "@/types/database";

export const CHANNELS: { key: Channel; label: string; color: string }[] = [
  { key: "whatsapp", label: "WhatsApp", color: "#25D366" },
  { key: "instagram", label: "Instagram", color: "#E1306C" },
  { key: "messenger", label: "Messenger", color: "#0084FF" },
];
