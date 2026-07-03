import { STATUS_CONFIG } from "@/lib/inbox/status";
import type { ConversationStatus } from "@/types/database";

export function StatusBadge({ status }: { status: ConversationStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-2)]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.dot }} />
      {config.label}
    </span>
  );
}
