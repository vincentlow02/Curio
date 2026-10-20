"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAuth } from "../../../components/auth/auth-provider";
import { Button } from "../../../components/ui/button";

export default function ResetPasswordPage(): React.ReactElement {
  const { user, loading, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      await updatePassword(password);
      setComplete(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Your password could not be updated.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-[100svh] place-items-center bg-white px-4 py-10">
      <section className="w-full max-w-[400px] rounded-[20px] border border-[#e7e7e7] p-7 text-[#292929] shadow-[0_18px_60px_#0000000d] sm:p-8">
        <div className="flex flex-col items-center text-center">
          <img src="/brands/curio-logo.png" alt="Curio" className="mb-5 h-8 w-auto object-contain" />
          <h1 className="text-[22px] font-semibold tracking-[-.4px]">Reset your password</h1>
          <p className="mt-2 text-[13px] leading-5 text-[#777]">Choose a new password for your Curio account.</p>
        </div>
        {loading ? (
          <p className="mt-6 text-center text-[13px] text-[#777]" role="status">Checking your reset link…</p>
        ) : complete ? (
          <div className="mt-6 text-center">
            <p className="text-[13px] text-[#39734b]" role="status">Your password has been updated.</p>
            <Link className="mt-4 inline-block text-[13px] underline underline-offset-2" href="/">Continue to Curio</Link>
          </div>
        ) : user ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
            <div className="space-y-1.5">
              <label htmlFor="curio-new-password" className="text-[13px] font-medium">New password</label>
              <input
                id="curio-new-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={pending}
                className="h-10 w-full rounded-[10px] border border-[#e5e7eb] px-3.5 text-[14px] outline-none focus:border-[#c7c9ce] focus:ring-2 focus:ring-[#111]/5 disabled:opacity-60"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="curio-confirm-password" className="text-[13px] font-medium">Confirm new password</label>
              <input
                id="curio-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={pending}
                className="h-10 w-full rounded-[10px] border border-[#e5e7eb] px-3.5 text-[14px] outline-none focus:border-[#c7c9ce] focus:ring-2 focus:ring-[#111]/5 disabled:opacity-60"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>{pending ? "Updating…" : "Update password"}</Button>
            {error ? <p className="text-[12px] text-[#b42318]" role="alert">{error}</p> : null}
          </form>
        ) : (
          <div className="mt-6 text-center">
            <p className="text-[13px] leading-5 text-[#777]" role="alert">
              This password reset link is invalid or has expired. Return to Curio and request a new one.
            </p>
            <Link className="mt-4 inline-block text-[13px] underline underline-offset-2" href="/">Return to Curio</Link>
          </div>
        )}
      </section>
    </main>
  );
}
