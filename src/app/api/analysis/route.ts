import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { isCollectibleCategory } from "../../../core/profile/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import { runDetection } from "../../../server/analysis/run-pipeline";
import { env } from "../../../server/config/env";
import { analysisQueue } from "../../../server/queue/analysis-queue";
import { enqueueSessionOrRollback } from "../../../server/queue/session-enqueue";
import { boundedFormData, RequestBodyTooLargeError } from "../../../server/security/bounded-form-data";
import { hasDemoAccess } from "../../../server/security/demo-access";
import { checkDemoRateLimit } from "../../../server/security/demo-rate-limit";
import { publicError } from "../../../server/security/redact-error";
import { assertImageSignature, validateUpload } from "../../../server/security/upload-validation";
import { cleanupExpiredSessions, createSession, deleteSession, sessionRoot, updateSession } from "../../../server/sessions/session-store";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasDemoAccess(request)) return NextResponse.json({ error: "Invalid Access Code." }, { status: 401 });
  const rateLimit = checkDemoRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "The public demo usage limit has been reached. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }
  let pendingSessionId: string | null = null;
  try {
    await cleanupExpiredSessions();
    const data = await boundedFormData(request, env.maxUploadBytes);
    const file = data.get("image");
    const text = String(data.get("text") ?? "").trim();
    if (text.length > env.maxInputTextChars) return NextResponse.json({ error: `The description exceeds ${env.maxInputTextChars} characters.` }, { status: 400 });
    const rawCategory = data.get("category");
    const category = rawCategory === null || rawCategory === "" ? null : rawCategory;
    const rawCollectorMode = String(data.get("collectorMode") ?? "false");
    if (!/^(?:true|false)$/.test(rawCollectorMode)) return NextResponse.json({ error: "collectorMode must be true or false." }, { status: 400 });
    const collectorMode = rawCollectorMode === "true";
    const rawLocale = String(data.get("locale") ?? "en");
    const locale = rawLocale === "zh" || rawLocale === "ja" ? rawLocale : "en";
    if (category !== null && !isCollectibleCategory(category)) return NextResponse.json({ error: "Invalid collectible category." }, { status: 400 });
    const hasImage = file instanceof File && file.size > 0;
    if (!hasImage && !text) return NextResponse.json({ error: "Upload an image or enter a collectible description.", code: "empty_input" }, { status: 400 });
    if (!hasImage && !isSpecificDescription(text)) return NextResponse.json({ error: "Add a brand, character, model, series or title.", code: "needs_clarification" }, { status: 422 });
    const id = randomUUID();
    pendingSessionId = id;
    const directory = sessionRoot(id);
    await mkdir(directory, { recursive: true });
    let imagePath: string | null = null;
    let mimeType: string | null = null;
    if (hasImage) {
      const image = file as File;
      const { extension } = validateUpload(image, env.maxUploadBytes);
      const bytes = Buffer.from(await image.arrayBuffer());
      assertImageSignature(bytes, image.type);
      imagePath = resolve(directory, `upload${extension}`);
      mimeType = image.type;
      await writeFile(imagePath, bytes);
    }
    await createSession(id, { imagePath, mimeType, inputText: text, selectedCategory: category, collectorMode, locale });
    const queuePosition = await enqueueSessionOrRollback(analysisQueue, id, () => runDetection(id));
    await updateSession(id, { queuePosition });
    pendingSessionId = null;
    return NextResponse.json({ sessionId: id, status: "queued", queuePosition }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (pendingSessionId) await deleteSession(pendingSessionId);
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    const message = publicError(error, "The analysis request could not be accepted.");
    const status = /queue is full/i.test(message) ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
