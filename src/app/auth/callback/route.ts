import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const supabase = await createSupabaseServerClient();

  if (!code) {
    return NextResponse.redirect(new URL("/?authError=callback", request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/?authError=callback", request.url));
  }

  return NextResponse.redirect(new URL(destination, request.url));
}
