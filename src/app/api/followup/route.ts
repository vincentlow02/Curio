import { NextResponse } from "next/server";
import type { AnalysisResult } from "../../../core/analysis/types";
import { assertDetectionResult } from "../../../core/profile/types";
import {
  answerCollectibleFollowup,
  type FollowupAnalysisContext,
  type FollowupConversationTurn,
} from "../../../server/providers/qwen/detect";
import { env } from "../../../server/config/env";
import { ConversationRequestError, readConversationRequest } from "../../../server/conversations/request";
import { checkDemoRateLimit } from "../../../server/security/demo-rate-limit";
import { publicError } from "../../../server/security/redact-error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function optionalPrice(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function safeText(value: unknown, maximum: number): value is string {
  return boundedString(value, maximum) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function safeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateFollowupContext(value: unknown): FollowupAnalysisContext {
  if (!isRecord(value) || !isRecord(value.identification) || !isRecord(value.priceReference)) {
    throw new Error("An analysis result is required to answer a follow-up.");
  }

  assertDetectionResult(value.identification);
  const identity = value.identification as AnalysisResult["identification"];
  if (!safeText(identity.itemName, 200) || !safeText(identity.version, 200)
    || !safeText(identity.priceSearchKeywordJa, 120)
    || (identity.productType !== undefined && !safeText(identity.productType, 40))) {
    throw new Error("The identification data is invalid.");
  }
  const price = value.priceReference;
  if (price.currency !== "JPY" || !optionalPrice(price.low) || !optionalPrice(price.median) || !optionalPrice(price.high)
    || typeof price.sampleCount !== "number" || !Number.isInteger(price.sampleCount) || price.sampleCount < 0 || price.sampleCount > 1_000
    || !Array.isArray(price.samples)) {
    throw new Error("The price analysis data is invalid.");
  }

  const samples = price.samples.slice(0, 12).flatMap((sample) => {
    if (!isRecord(sample) || !safeText(sample.title, 300) || typeof sample.price !== "number"
      || !Number.isFinite(sample.price) || sample.price < 0 || sample.currency !== "JPY"
      || !safeText(sample.source, 80) || !safeText(sample.condition, 40) || !boundedString(sample.url, 2_000) || !safeUrl(sample.url)) return [];
    return [{ title: sample.title, price: sample.price, currency: "JPY" as const, source: sample.source, condition: sample.condition, url: sample.url }];
  });

  const listings = Array.isArray(value.discoveryListings) ? value.discoveryListings.slice(0, 12).flatMap((listing) => {
    if (!isRecord(listing) || !safeText(listing.title, 300) || !optionalPrice(listing.price)
      || listing.currency !== "JPY" || !safeText(listing.source, 80)
      || !safeText(listing.availability, 40) || !safeText(listing.condition, 40)
      || !boundedString(listing.url, 2_000) || !safeUrl(listing.url)) return [];
    return [{
      title: listing.title,
      price: listing.price,
      currency: "JPY" as const,
      source: listing.source,
      availability: listing.availability,
      condition: listing.condition,
      url: listing.url,
    }];
  }) : [];

  const areas = Array.isArray(value.recommendedAreas) ? value.recommendedAreas.slice(0, 8).flatMap((area) => {
    if (!isRecord(area) || !safeText(area.area, 100) || !safeText(area.reason, 500)) return [];
    return [{ area: area.area, reason: area.reason }];
  }) : [];

  return {
    identity: {
      itemName: identity.itemName,
      version: identity.version,
      productType: identity.productType ?? null,
      category: identity.category,
    },
    priceReference: {
      currency: "JPY",
      low: price.low,
      median: price.median,
      high: price.high,
      sampleCount: price.sampleCount,
      samples,
    },
    listings,
    areas,
  };
}

class FollowupRequestError extends Error {}

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkDemoRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "The public demo usage limit has been reached. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }

  try {
    const body = await readConversationRequest(request);
    if (!isRecord(body) || !safeText(body.question, env.maxInputTextChars) || !body.question.trim()
      || (body.locale !== "en" && body.locale !== "zh" && body.locale !== "ja")) {
      throw new FollowupRequestError("The follow-up question is invalid.");
    }
    if (!Array.isArray(body.history) || body.history.length > 10) {
      throw new FollowupRequestError("The follow-up history is invalid.");
    }
    const history: FollowupConversationTurn[] = body.history.map((turn) => {
      if (!isRecord(turn) || !safeText(turn.question, env.maxInputTextChars) || !turn.question.trim()
        || !safeText(turn.answer, 4_000) || !turn.answer.trim()) {
        throw new FollowupRequestError("The follow-up history is invalid.");
      }
      return { question: turn.question, answer: turn.answer };
    });
    let context: FollowupAnalysisContext;
    try {
      context = validateFollowupContext(body.result);
    } catch (error) {
      throw new FollowupRequestError(error instanceof Error ? error.message : "The analysis data is invalid.");
    }
    const answer = await answerCollectibleFollowup({ question: body.question.trim(), history, context, locale: body.locale });
    return NextResponse.json({ answer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConversationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof FollowupRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: publicError(error, "The follow-up could not be answered.") }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
