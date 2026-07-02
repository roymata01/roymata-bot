import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendForChannel } from "@/lib/meta/send-message";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;

  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { content } = await req.json();
  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "Falta el contenido del mensaje" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("*, contact:contacts(*)")
    .eq("id", conversationId)
    .single();
  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      contact_id: conversation.contact_id,
      channel: conversation.channel,
      direction: "out",
      sender_type: "human",
      sender_user_id: user.id,
      content: content.trim(),
    })
    .select()
    .single();
  if (insertError) throw insertError;

  try {
    const metaMessageId = await sendForChannel(conversation.channel, conversation.contact.external_id, content.trim());
    await supabase.from("messages").update({ status: "sent", meta_message_id: metaMessageId }).eq("id", message.id);
  } catch (error) {
    console.error("Error enviando mensaje manual:", error);
    await supabase.from("messages").update({ status: "failed" }).eq("id", message.id);
    return NextResponse.json({ error: "El mensaje se guardó pero no se pudo enviar" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, messageId: message.id });
}
