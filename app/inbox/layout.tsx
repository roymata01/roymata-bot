import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex h-screen flex-col bg-[#F5F1E8]">
      <header className="flex items-center justify-between border-b-2 border-black bg-[#F5F1E8] px-5 py-3">
        <h1 className="text-lg font-bold">VITA RESCUE INBOX</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-600">{user?.email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
