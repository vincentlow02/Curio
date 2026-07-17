import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { runAnalysis } from "../../../server/analysis/run-pipeline";
import { env } from "../../../server/config/env";
import { analysisQueue } from "../../../server/queue/analysis-queue";
import { hasDemoAccess } from "../../../server/security/demo-access";
import { clientIp, consumeRateLimit } from "../../../server/security/rate-limit";
import { publicError } from "../../../server/security/redact-error";
import { assertImageSignature, validateUpload } from "../../../server/security/upload-validation";
import { cleanupExpiredSessions, createSession, sessionRoot, updateSession } from "../../../server/sessions/session-store";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasDemoAccess(request)) return NextResponse.json({ error: "演示访问码无效。" }, { status: 401 });
  if (!consumeRateLimit(clientIp(request))) return NextResponse.json({ error: "请求次数过多，请一小时后重试。" }, { status: 429 });
  try {
    await cleanupExpiredSessions();
    const data = await request.formData();
    const file = data.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择一张图片。" }, { status: 400 });
    const { extension } = validateUpload(file, env.maxUploadBytes);
    const bytes = Buffer.from(await file.arrayBuffer());
    assertImageSignature(bytes, file.type);
    const id = randomUUID();
    const directory = sessionRoot(id);
    await mkdir(directory, { recursive: true });
    const imagePath = resolve(directory, `upload${extension}`);
    await writeFile(imagePath, bytes);
    await createSession(id, imagePath, file.type);
    const queuePosition = analysisQueue.enqueue({ id, run: () => runAnalysis(id) });
    await updateSession(id, { queuePosition });
    return NextResponse.json({ sessionId: id, status: "queued", queuePosition }, { status: 202 });
  } catch (error) {
    const message = publicError(error);
    const status = /队列已满/.test(message) ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
