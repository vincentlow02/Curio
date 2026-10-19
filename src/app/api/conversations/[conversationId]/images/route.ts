import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getVerifiedUser } from "../../../../../server/authenticated-user";
import { env } from "../../../../../server/config/env";
import { boundedFormData, RequestBodyTooLargeError } from "../../../../../server/security/bounded-form-data";
import { assertImageSignature, validateUpload } from "../../../../../server/security/upload-validation";
import { isConversationId } from "../../../../../server/conversations/request";

const BUCKET = "conversation-images";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await getVerifiedUser();
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error === "unauthenticated" ? "Sign in to save attachments." : "Unable to verify the current session." },
      { status: auth.error === "unauthenticated" ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { conversationId } = await context.params;
  if (!isConversationId(conversationId)) return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  const { data: conversation, error: conversationError } = await auth.supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (conversationError) return NextResponse.json({ error: "Conversation could not be verified." }, { status: 503 });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  try {
    const form = await boundedFormData(request, env.maxUploadBytes);
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "An image file is required." }, { status: 400 });
    validateUpload(file, env.maxUploadBytes);
    assertImageSignature(Buffer.from(await file.arrayBuffer()), file.type);

    const path = `${auth.user.id}/${conversationId}/${randomUUID()}`;
    const { error: uploadError } = await auth.supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: "The conversation image could not be saved." }, { status: 503 });
    return NextResponse.json({ path }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "The image request is too large." }, { status: 413 });
    }
    if (error instanceof TypeError || (error instanceof Error && /^(?:The request must use multipart\/form-data|Invalid Content-Length header|Unsupported image format|The uploaded image is empty|The image exceeds|The file content does not match)/.test(error.message))) {
      return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 });
    }
    throw error;
  }
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await getVerifiedUser();
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error === "unauthenticated" ? "Sign in to view attachments." : "Unable to verify the current session." },
      { status: auth.error === "unauthenticated" ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { conversationId } = await context.params;
  if (!isConversationId(conversationId)) return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  const path = new URL(request.url).searchParams.get("path");
  const expectedPrefix = `${auth.user.id}/${conversationId}/`;
  if (!path?.startsWith(expectedPrefix) || path.includes("..")) return NextResponse.json({ error: "Invalid conversation image path." }, { status: 400 });

  const { data, error } = await auth.supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) return NextResponse.json({ error: "The conversation image could not be loaded." }, { status: 404 });
  return NextResponse.json({ signedUrl: data.signedUrl }, { headers: { "Cache-Control": "no-store" } });
}
