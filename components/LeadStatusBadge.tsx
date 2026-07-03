import { LEAD_STATUS_CONFIG } from "@/lib/inbox/lead-status";
import type { LeadStatus } from "@/types/database";

export function LeadStatusBadge({ status }: { status: LeadStatus | null }) {
  if (!status) return null;
  const config = LEAD_STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-px text-[11px] font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
