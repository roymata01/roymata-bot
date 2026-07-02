import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBusinessRelevant } from "@/lib/ai/check-relevance";
import { generateTestReply } from "@/lib/ai/generate-test-reply";

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (error) {
    console.error("test-chat error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { history, message } = await req.json();
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Falta el mensaje" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("assistant_settings")
    .select("escalation_keywords")
    .eq("id", 1)
    .single();

  const normalized = message.toLowerCase();
  const escalationMatch = (settings?.escalation_keywords ?? []).find((k: string) => normalized.includes(k.toLowerCase()));
  if (escalationMatch) {
    return NextResponse.json({ type: "escalation", keyword: escalationMatch });
  }

  const relevant = await isBusinessRelevant(message);
  if (!relevant) {
    return NextResponse.json({ type: "irrelevant" });
  }

  const replyText = await generateTestReply([...(history ?? []), { role: "user", content: message }]);
  return NextResponse.json({ type: "reply", reply: replyText });
}
