"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

let browserClient: SupabaseClient | undefined;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { url, publishableKey } = getSupabaseConfig();
    browserClient = createBrowserClient(url, publishableKey);
  }
  return browserClient;
}
