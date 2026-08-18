import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { isSpecificDescription } from "../../../core/profile/input-routing";
import { isCollectibleCategory } from "../../../core/profile/types";
import { identifyCollectible } from "../../../server/analysis/run-pipeline";
import { env } from "../../../server/config/env";
import { boundedFormData, RequestBodyTooLargeError } from "../../../server/security/bounded-form-data";
import { hasDemoAccess } from "../../../server/security/demo-access";
import { checkDemoRateLimit } from "../../../server/security/demo-rate-limit";
import { publicError } from "../../../server/security/redact-error";
import { assertImageSignature, validateUpload } from "../../../server/security/upload-validation";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasDemoAccess(request)) return NextResponse.json({ error: "Invalid Access Code." }, { status: 401 });
  const rateLimit = checkDemoRateLimit(request);
  if (!rateLimit.allowed) return NextResponse.json({ error: "The public demo usage limit has been reached. Please try again later." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } });
  try {
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

    let imageDataUrl: string | null = null;
    if (hasImage) {
      const image = file as File;
      validateUpload(image, env.maxUploadBytes);
      const bytes = Buffer.from(await image.arrayBuffer());
      assertImageSignature(bytes, image.type);
      imageDataUrl = `data:${image.type};base64,${bytes.toString("base64")}`;
    }
    const runId = randomUUID();
    const result = await identifyCollectible({ imageDataUrl, inputText: text, selectedCategory: category, collectorMode, locale });
    return NextResponse.json({ runId, sessionId: runId, createdAt: new Date().toISOString(), collectorMode, ...result }, { status: result.status === "failed" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    return NextResponse.json({ error: publicError(error, "The analysis request could not be completed.") }, { status: 400 });
  }
}
