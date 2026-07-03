import { CHANNELS } from "@/lib/channels";
import type { Channel } from "@/types/database";

export function ChannelBadge({ channel }: { channel: Channel }) {
  const info = CHANNELS.find((c) => c.key === channel)!;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-2)]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info.color }} />
      {info.label}
    </span>
  );
}
