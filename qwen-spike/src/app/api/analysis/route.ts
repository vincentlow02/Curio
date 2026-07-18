import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { isCollectibleCategory } from "../../../core/profile/types";
import { isSpecificDescription } from "../../../core/profile/input-routing";
import { runDetection } from "../../../server/analysis/run-pipeline";
import { env } from "../../../server/config/env";
import { analysisQueue } from "../../../server/queue/analysis-queue";
import { hasDemoAccess } from "../../../server/security/demo-access";
import { clientIp, consumeRateLimit } from "../../../server/security/rate-limit";
import { publicError } from "../../../server/security/redact-error";
import { assertImageSignature, validateUpload } from "../../../server/security/upload-validation";
import { cleanupExpiredSessions, createSession, sessionRoot, updateSession } from "../../../server/sessions/session-store";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasDemoAccess(request)) return NextResponse.json({ error: "Invalid Demo Access Code." }, { status: 401 });
  try {
    await cleanupExpiredSessions();
    const data = await request.formData();
    const file = data.get("image");
    const text = String(data.get("text") ?? "").trim();
    const rawCategory = data.get("category");
    const category = rawCategory === null || rawCategory === "" ? null : rawCategory;
    const rawCollectorMode = String(data.get("collectorMode") ?? "false");
    if (!/^(?:true|false)$/.test(rawCollectorMode)) return NextResponse.json({ error: "collectorMode must be true or false." }, { status: 400 });
    const collectorMode = rawCollectorMode === "true";
    if (category !== null && !isCollectibleCategory(category)) return NextResponse.json({ error: "Invalid collectible category." }, { status: 400 });
    const hasImage = file instanceof File && file.size > 0;
    if (!hasImage && !text) return NextResponse.json({ error: "Upload an image or enter a collectible description.", code: "empty_input" }, { status: 400 });
    if (!hasImage && !isSpecificDescription(text)) return NextResponse.json({ error: "Add a brand, character, model, series or title.", code: "needs_clarification" }, { status: 422 });
    if (!consumeRateLimit(clientIp(request))) return NextResponse.json({ error: "Too many analysis requests. Please try again in one hour." }, { status: 429 });
    const id = randomUUID();
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
    await createSession(id, { imagePath, mimeType, inputText: text, selectedCategory: category, collectorMode });
    const queuePosition = analysisQueue.enqueue({ id, run: () => runDetection(id) });
    await updateSession(id, { queuePosition });
    return NextResponse.json({ sessionId: id, status: "queued", queuePosition }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = publicError(error);
    const status = /queue is full/i.test(message) ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
