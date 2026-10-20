import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function redirectWithAuthError(request: NextRequest, isPasswordRecovery: boolean, reason: string): NextResponse {
  if (isPasswordRecovery) {
    return NextResponse.redirect(new URL("/auth/reset-password?invalid=1", request.url));
  }
  const destination = new URL("/", request.url);
  destination.searchParams.set("authError", "callback");
  destination.searchParams.set("authReason", reason.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64));
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const isPasswordRecovery = destination === "/auth/reset-password";
  const supabase = await createSupabaseServerClient();

  const providerError = request.nextUrl.searchParams.get("error_code") ?? request.nextUrl.searchParams.get("error");
  if (providerError) {
    return redirectWithAuthError(request, isPasswordRecovery, `provider_${providerError}`);
  }
  if (!code) {
    return redirectWithAuthError(request, isPasswordRecovery, "missing_code");
  }

  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
  const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  if (error) {
    console.error("Supabase auth callback exchange failed", { name: error.name, code: error.code, status: error.status });
    return redirectWithAuthError(request, isPasswordRecovery, `exchange_${error.code ?? error.name}`);
  }

  return NextResponse.redirect(new URL(destination, request.url));
}
