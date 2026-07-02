import { CHANNELS } from "@/lib/channels";
import type { Channel } from "@/types/database";

export function ChannelBadge({ channel }: { channel: Channel }) {
  const info = CHANNELS.find((c) => c.key === channel)!;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-black/20 px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${info.color}22`, color: info.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info.color }} />
      {info.label}
    </span>
  );
}
