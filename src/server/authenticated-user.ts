import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../lib/supabase/server";

export type VerifiedUserResult =
  | { supabase: SupabaseClient; user: User; error: null }
  | { supabase: null; user: null; error: "unauthenticated" | "unavailable" };

export async function getVerifiedUser(): Promise<VerifiedUserResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return { supabase: null, user: null, error: "unavailable" };
  if (!data.user) return { supabase: null, user: null, error: "unauthenticated" };
  return { supabase, user: data.user, error: null };
}
