import { NextResponse } from "next/server";
import { getVerifiedUser } from "../../../../server/authenticated-user";
import { ConversationRequestError, isConversationId, readConversationRequest, validateConversationRequest } from "../../../../server/conversations/request";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await getVerifiedUser();
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error === "unauthenticated" ? "Sign in to view saved conversations." : "Unable to verify the current session." },
      { status: auth.error === "unauthenticated" ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { conversationId } = await context.params;
  if (!isConversationId(conversationId)) return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  const { data, error } = await auth.supabase
    .from("conversations")
    .select("id, title, created_at, updated_at, messages(id, role, content, metadata, attachment_name, attachment_path, created_at)")
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Saved conversation could not be loaded." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const messages = [...data.messages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
  ).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
    metadata: message.metadata,
    ...(message.attachment_name ? { attachmentName: message.attachment_name } : {}),
    ...(message.attachment_path ? { attachmentPath: message.attachment_path } : {}),
  }));

  return NextResponse.json({
    id: data.id,
    title: data.title,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    messages,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await getVerifiedUser();
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error === "unauthenticated" ? "Sign in to save conversations." : "Unable to verify the current session." },
      { status: auth.error === "unauthenticated" ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { conversationId } = await context.params;
  if (!isConversationId(conversationId)) return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });

  try {
    const body = validateConversationRequest(await readConversationRequest(request));
    const { error } = await auth.supabase.rpc("save_conversation", {
      p_conversation_id: conversationId,
      p_title: body.title,
      p_created_at: body.createdAt,
      p_updated_at: body.updatedAt,
      p_messages: body.messages,
    });
    if (error) {
      return NextResponse.json({ error: "Conversation could not be saved." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ id: conversationId, updatedAt: body.updatedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConversationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await getVerifiedUser();
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error === "unauthenticated" ? "Sign in to delete conversations." : "Unable to verify the current session." },
      { status: auth.error === "unauthenticated" ? 401 : 503 },
    );
  }

  const { conversationId } = await context.params;
  if (!isConversationId(conversationId)) return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  const { data, error } = await auth.supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Conversation could not be deleted." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
