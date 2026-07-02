import { STATUS_CONFIG } from "@/lib/inbox/status";
import type { ConversationStatus } from "@/types/database";

export function StatusBadge({ status }: { status: ConversationStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
