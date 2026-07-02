import { LEAD_STATUS_CONFIG } from "@/lib/inbox/lead-status";
import type { LeadStatus } from "@/types/database";

export function LeadStatusBadge({ status }: { status: LeadStatus | null }) {
  if (!status) return null;
  const config = LEAD_STATUS_CONFIG[status];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
