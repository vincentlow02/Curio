import { describe, expect, it } from "vitest";

import { boundedFormData, MULTIPART_OVERHEAD_BYTES, RequestBodyTooLargeError } from "../src/server/security/bounded-form-data";
import { publicError } from "../src/server/security/redact-error";
import { checkDemoRateLimit, resetDemoRateLimitForTests } from "../src/server/security/demo-rate-limit";

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

describe("public error safety", () => {
  it("keeps allowlisted validation messages", () => {
    expect(publicError(new Error("Unsupported image format."))).toMatch(/Unsupported image format/);
  });

  it("does not expose provider secrets, URLs, paths, or stacks", () => {
    const sensitive = new Error("Bearer dtn-secret-value failed at C:\\private\\file via https://example.com?q=secret");
    sensitive.stack = `${sensitive.message}\n at private-file.ts:1`;
    expect(publicError(sensitive, "Provider unavailable.")).toBe("Provider unavailable.");
  });
});

describe("public demo rate limiting", () => {
  it("limits repeated requests without retaining the raw client address", () => {
    resetDemoRateLimitForTests();
    const request = new Request("http://localhost/api/analysis", { headers: { "x-forwarded-for": "203.0.113.10" } });
    const now = 1_000_000;

    for (let index = 0; index < 5; index += 1) {
      expect(checkDemoRateLimit(request, now)).toMatchObject({ allowed: true });
    }
    expect(checkDemoRateLimit(request, now)).toMatchObject({ allowed: false, retryAfterSeconds: 3600 });
  });

  it("starts a new client window after it expires", () => {
    resetDemoRateLimitForTests();
    const request = new Request("http://localhost/api/analysis", { headers: { "x-real-ip": "198.51.100.4" } });
    for (let index = 0; index < 5; index += 1) checkDemoRateLimit(request, 0);

    expect(checkDemoRateLimit(request, 60 * 60_000)).toMatchObject({ allowed: true });
  });
});
