import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { boundedFormData, MULTIPART_OVERHEAD_BYTES, RequestBodyTooLargeError } from "../src/server/security/bounded-form-data";
import { clientIp } from "../src/server/security/rate-limit";
import { publicError } from "../src/server/security/redact-error";
import { enqueueSessionOrRollback } from "../src/server/queue/session-enqueue";
import { createSession, deleteSession, internalSession, sessionRoot } from "../src/server/sessions/session-store";

describe("bounded multipart parsing", () => {
  it("parses a normal multipart request", async () => {
    const input = new FormData();
    input.set("text", "Sony PSP-3000");
    const request = new Request("http://localhost/api/analysis", { method: "POST", body: input });
    const parsed = await boundedFormData(request, 1024);
    expect(parsed.get("text")).toBe("Sony PSP-3000");
  });

  it("rejects an oversized declared Content-Length before parsing", async () => {
    const request = new Request("http://localhost/api/analysis", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(MULTIPART_OVERHEAD_BYTES + 2),
      },
      body: "--test--",
    });
    await expect(boundedFormData(request, 1)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("rejects an oversized stream without Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MULTIPART_OVERHEAD_BYTES + 2));
        controller.close();
      },
    });
    const request = new Request("http://localhost/api/analysis", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=test" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(boundedFormData(request, 1)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});

describe("trusted client IP selection", () => {
  it("prefers Railway X-Real-IP over a forged forwarded chain", () => {
    const request = new Request("http://localhost", {
      headers: { "x-real-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.9" },
    });
    expect(clientIp(request, true)).toBe("203.0.113.8");
  });

  it("does not trust X-Forwarded-For in production when X-Real-IP is absent", () => {
    const request = new Request("http://localhost", { headers: { "x-forwarded-for": "198.51.100.9" } });
    expect(clientIp(request, true)).toBe("unknown");
    expect(clientIp(request, false)).toBe("198.51.100.9");
  });
});

describe("public error safety", () => {
  it("keeps allowlisted validation messages", () => {
    expect(publicError(new Error("The analysis queue is full. Please try again shortly."))).toMatch(/queue is full/i);
  });

  it("does not expose provider secrets, URLs, paths, or stacks", () => {
    const sensitive = new Error("Bearer dtn-secret-value failed at C:\\private\\file via https://example.com?q=secret");
    sensitive.stack = `${sensitive.message}\n at private-file.ts:1`;
    expect(publicError(sensitive, "Provider unavailable.")).toBe("Provider unavailable.");
  });
});

describe("queue rollback", () => {
  it("removes the session and temporary directory when enqueue fails", async () => {
    const id = randomUUID();
    await createSession(id, {
      imagePath: null,
      mimeType: null,
      inputText: "Sony PSP-3000",
      selectedCategory: null,
      collectorMode: false,
    });
    const fullQueue = { enqueue: () => { throw new Error("The analysis queue is full. Please try again shortly."); } };

    await expect(enqueueSessionOrRollback(fullQueue, id, async () => {})).rejects.toThrow(/queue is full/i);
    expect(internalSession(id)).toBeNull();
    await expect(stat(sessionRoot(id))).rejects.toMatchObject({ code: "ENOENT" });
    await deleteSession(id);
  });
});
