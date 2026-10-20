"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { hasSupabaseConfig } from "../../lib/supabase/config";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  authConfigured: boolean;
  error: string | null;
  signInWithGoogle: (returnTo?: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getAuthRedirectTo(path: string): string {
  const next = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  const redirectTo = new URL("/auth/callback", window.location.origin);
  if (next !== "/") redirectTo.searchParams.set("next", next);
  return redirectTo.toString();
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authConfigured = hasSupabaseConfig();
  const supabase = useMemo(() => authConfigured ? createSupabaseBrowserClient() : null, [authConfigured]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("authError") === "callback") {
      const reason = params.get("authReason");
      const reference = reason && /^[a-zA-Z0-9_-]{1,64}$/.test(reason) ? ` (${reason})` : "";
      setError(`Sign-in could not be completed${reference}. Please try again.`);
      params.delete("authError");
      params.delete("authReason");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError && authError.name !== "AuthSessionMissingError") setError(authError.message);
      setUser(data.user);
      setLoading(false);
    }).catch((authError: unknown) => {
      if (!active) return;
      if (!(authError instanceof Error && authError.name === "AuthSessionMissingError")) {
        setError(authError instanceof Error ? authError.message : "Unable to verify the current session.");
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session) setError(null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithGoogle = useCallback(async (returnTo = "/"): Promise<void> => {
    if (!supabase) throw new Error("Google sign-in is not configured for this deployment.");
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getAuthRedirectTo(returnTo) },
    });
    if (signInError) {
      setError(signInError.message);
      throw signInError;
    }
  }, [supabase]);

  const signInWithPassword = useCallback(async (email: string, password: string): Promise<void> => {
    if (!supabase) throw new Error("Email sign-in is not configured for this deployment.");
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      throw signInError;
    }
  }, [supabase]);

  const signUpWithPassword = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!supabase) throw new Error("Email sign-up is not configured for this deployment.");
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getAuthRedirectTo("/") },
    });
    if (signUpError) {
      setError(signUpError.message);
      throw signUpError;
    }
    return data.session === null;
  }, [supabase]);

  const requestPasswordReset = useCallback(async (email: string): Promise<void> => {
    if (!supabase) throw new Error("Password recovery is not configured for this deployment.");
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectTo("/auth/reset-password"),
    });
    if (resetError) {
      setError(resetError.message);
      throw resetError;
    }
  }, [supabase]);

  const updatePassword = useCallback(async (password: string): Promise<void> => {
    if (!supabase) throw new Error("Password updates are not configured for this deployment.");
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      throw updateError;
    }
  }, [supabase]);

  const signOut = useCallback(async (): Promise<void> => {
    if (!supabase) throw new Error("Supabase Auth is not configured for this deployment.");
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      setError(signOutError.message);
      throw signOutError;
    }
  }, [supabase]);

  const value = useMemo(() => ({
    user,
    loading,
    authConfigured,
    error,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    requestPasswordReset,
    updatePassword,
    signOut,
  }), [user, loading, authConfigured, error, signInWithGoogle, signInWithPassword, signUpWithPassword, requestPasswordReset, updatePassword, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
