export function hasSupabaseConfig(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url ?? "");
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP or HTTPS URL.");
  }
  if (!publishableKey || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
    throw new Error("Supabase is not configured correctly. Set a valid NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  return { url: parsedUrl.toString().replace(/\/$/, ""), publishableKey };
}
