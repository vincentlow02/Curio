import { NextResponse } from "next/server";
import { getVerifiedUser } from "../../../server/authenticated-user";

export async function GET(): Promise<NextResponse> {
  const auth = await getVerifiedUser();
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error === "unauthenticated" ? "Sign in to view saved conversations." : "Unable to verify the current session." },
      { status: auth.error === "unauthenticated" ? 401 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await auth.supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Saved conversations could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(data.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })), { headers: { "Cache-Control": "no-store" } });
}
