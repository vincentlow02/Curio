"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "./button";
import { DialogDescription, DialogTitle } from "./dialog";
import { Separator } from "./separator";

const labels = {
  en: {
    welcome: "Welcome to Curio",
    description: "Sign in to save your discoveries and access them anywhere.",
    email: "Email",
    emailPlaceholder: "m@example.com",
    password: "Password",
    confirmPassword: "Confirm password",
    forgotPassword: "Forgot your password?",
    signIn: "Sign in",
    signUp: "Sign up",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    google: "Continue with Google",
    continueGuest: "Continue as guest",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    unavailable: "Email and Google sign-in are not configured for this deployment.",
    or: "or",
    opening: "Opening Google…",
    resetTitle: "Reset your password",
    resetDescription: "Enter your email and we'll send you a password reset link.",
    sendReset: "Send reset link",
    backToSignIn: "Back to sign in",
    checkEmail: "Check your inbox for a link to reset your password.",
    confirmEmail: "Check your inbox to confirm your email address.",
    passwordMismatch: "Passwords do not match.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    authFailure: "The account action could not be completed.",
  },
  zh: {
    welcome: "欢迎使用 Curio",
    description: "登录以保存你的探索记录，并随时随地访问。",
    email: "邮箱",
    emailPlaceholder: "m@example.com",
    password: "密码",
    confirmPassword: "确认密码",
    forgotPassword: "忘记密码？",
    signIn: "登录",
    signUp: "注册",
    noAccount: "还没有账号？",
    hasAccount: "已有账号？",
    google: "使用 Google 继续",
    continueGuest: "继续以游客身份使用",
    terms: "服务条款",
    privacy: "隐私政策",
    unavailable: "此部署尚未配置邮箱或 Google 登录。",
    or: "或",
    opening: "正在打开 Google…",
    resetTitle: "重置密码",
    resetDescription: "输入邮箱，我们会向你发送密码重置链接。",
    sendReset: "发送重置链接",
    backToSignIn: "返回登录",
    checkEmail: "请查看邮箱中的密码重置链接。",
    confirmEmail: "请查看邮箱并确认你的邮箱地址。",
    passwordMismatch: "两次输入的密码不一致。",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    authFailure: "无法完成账户操作。",
  },
  ja: {
    welcome: "Curio へようこそ",
    description: "ログインして発見を保存し、どこからでもアクセスできます。",
    email: "メールアドレス",
    emailPlaceholder: "m@example.com",
    password: "パスワード",
    confirmPassword: "パスワードを確認",
    forgotPassword: "パスワードをお忘れですか？",
    signIn: "ログイン",
    signUp: "新規登録",
    noAccount: "アカウントをお持ちでないですか？",
    hasAccount: "すでにアカウントをお持ちですか？",
    google: "Google で続行",
    continueGuest: "ゲストとして続行",
    terms: "利用規約",
    privacy: "プライバシーポリシー",
    unavailable: "このデプロイではメールまたは Google ログインが設定されていません。",
    or: "または",
    opening: "Google を開いています…",
    resetTitle: "パスワードをリセット",
    resetDescription: "メールアドレスを入力すると、リセット用リンクを送信します。",
    sendReset: "リセットリンクを送信",
    backToSignIn: "ログインに戻る",
    checkEmail: "パスワードリセット用リンクをメールで確認してください。",
    confirmEmail: "メールを確認し、アドレスを認証してください。",
    passwordMismatch: "パスワードが一致しません。",
    showPassword: "パスワードを表示",
    hidePassword: "パスワードを隠す",
    authFailure: "アカウント操作を完了できませんでした。",
  },
};

type LoginMode = "sign_in" | "sign_up" | "forgot";

function GoogleMark(): React.ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]">
      <path fill="#4285F4" d="M21.6 12.23c0-.72-.06-1.42-.18-2.1H12v3.97h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.52c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.89A6 6 0 0 1 6.1 12c0-.66.11-1.3.31-1.89v-2.6H3.06A10 10 0 0 0 2 12c0 1.62.39 3.15 1.06 4.49l3.35-2.6Z" />
      <path fill="#EA4335" d="M12 5.99c1.47 0 2.79.51 3.83 1.52l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.51l3.35 2.6C7.2 7.75 9.4 5.99 12 5.99Z" />
    </svg>
  );
}

export function LoginForm({
  locale,
  authConfigured,
  pending: googlePending,
  error,
  onGoogleSignIn,
  onContinueAsGuest,
  onSignIn,
  onSignUp,
  onRequestPasswordReset,
}: {
  locale: keyof typeof labels;
  authConfigured: boolean;
  pending: boolean;
  error: string | null;
  onGoogleSignIn: () => void;
  onContinueAsGuest: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<boolean>;
  onRequestPasswordReset: (email: string) => Promise<void>;
}): React.ReactElement {
  const copy = labels[locale];
  const [mode, setMode] = useState<LoginMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formPending, setFormPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = formPending || googlePending;
  const title = mode === "forgot" ? copy.resetTitle : copy.welcome;
  const description = mode === "forgot" ? copy.resetDescription : copy.description;
  const inlineButtonClass = "appearance-none rounded-none border-0 bg-transparent p-0 font-sans text-[12px] leading-normal shadow-none focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e98470]";

  function changeMode(nextMode: LoginMode): void {
    setMode(nextMode);
    setFormError(null);
    setNotice(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    if (mode === "sign_up" && password !== confirmPassword) {
      setFormError(copy.passwordMismatch);
      return;
    }

    setFormPending(true);
    try {
      if (mode === "sign_in") {
        await onSignIn(email, password);
      } else if (mode === "sign_up") {
        const confirmationRequired = await onSignUp(email, password);
        if (confirmationRequired) setNotice(copy.confirmEmail);
      } else {
        await onRequestPasswordReset(email);
        setNotice(copy.checkEmail);
      }
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : copy.authFailure);
    } finally {
      setFormPending(false);
    }
  }

  return (
    <div key={mode} className="curio-login-content flex flex-col items-center text-center">
      <img src="/brands/curio-logo.png" alt="Curio" className="mb-3 h-7 w-auto object-contain" />
      <DialogTitle className="m-0 text-[20px] font-semibold tracking-[-.4px]">{title}</DialogTitle>
      <DialogDescription className="m-0 mt-1.5 max-w-[290px] text-[12px] leading-[18px] text-[#777]">{description}</DialogDescription>

      <form className="mt-5 w-full space-y-3 text-left" onSubmit={(event) => void submit(event)}>
        <div className="space-y-1">
          <label htmlFor="curio-auth-email" className="text-[13px] font-medium text-[#292929]">{copy.email}</label>
          <input
            id="curio-auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={copy.emailPlaceholder}
            disabled={busy}
            className="h-9 w-full rounded-[9px] border border-[#e5e7eb] bg-white px-3 text-[13px] text-[#222] outline-none transition-shadow placeholder:text-[11px] placeholder:text-[#9ca3af] focus:border-[#c7c9ce] focus:ring-2 focus:ring-[#111]/5 disabled:opacity-60"
          />
        </div>
        {mode !== "forgot" ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="curio-auth-password" className="text-[13px] font-medium text-[#292929]">{copy.password}</label>
              {mode === "sign_in" ? (
                <button type="button" className={`${inlineButtonClass} cursor-pointer text-[#6b7280] underline underline-offset-2 hover:text-[#222]`} style={{ fontSize: "11px" }} onClick={() => changeMode("forgot")}>
                  {copy.forgotPassword}
                </button>
              ) : null}
            </div>
            <div className="relative">
              <input
                id="curio-auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                className="h-9 w-full rounded-[9px] border border-[#e5e7eb] bg-white px-3 pr-10 text-[13px] text-[#222] outline-none transition-shadow focus:border-[#c7c9ce] focus:ring-2 focus:ring-[#111]/5 disabled:opacity-60"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 grid w-9 appearance-none place-items-center rounded-none border-0 bg-transparent p-0 text-[#737987] shadow-none hover:text-[#222] focus-visible:outline-2 focus-visible:outline-[#e98470]"
                aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
        ) : null}
        {mode === "sign_up" ? (
          <div className="space-y-1">
            <label htmlFor="curio-auth-confirm-password" className="text-[13px] font-medium text-[#292929]">{copy.confirmPassword}</label>
            <input
              id="curio-auth-confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={busy}
              className="h-9 w-full rounded-[9px] border border-[#e5e7eb] bg-white px-3 text-[13px] text-[#222] outline-none transition-shadow focus:border-[#c7c9ce] focus:ring-2 focus:ring-[#111]/5 disabled:opacity-60"
            />
          </div>
        ) : null}
        <Button type="submit" className="w-full" style={{ fontSize: "12px" }} disabled={busy || !authConfigured}>
          {formPending
            ? "Please wait…"
            : mode === "forgot" ? copy.sendReset : mode === "sign_up" ? copy.signUp : copy.signIn}
        </Button>
      </form>

      {mode === "sign_in" ? (
        <p className="m-0 mt-2.5 text-[11px] text-[#858b98]">
          {copy.noAccount}{" "}
          <button type="button" className={`${inlineButtonClass} cursor-pointer text-[#444] underline underline-offset-2`} onClick={() => changeMode("sign_up")}>{copy.signUp}</button>
        </p>
      ) : mode === "sign_up" ? (
        <p className="m-0 mt-2.5 text-[11px] text-[#858b98]">
          {copy.hasAccount}{" "}
          <button type="button" className={`${inlineButtonClass} cursor-pointer text-[#444] underline underline-offset-2`} onClick={() => changeMode("sign_in")}>{copy.signIn}</button>
        </p>
      ) : (
        <button type="button" className={`mt-2.5 ${inlineButtonClass} cursor-pointer text-[#555] underline underline-offset-2`} onClick={() => changeMode("sign_in")}>
          {copy.backToSignIn}
        </button>
      )}

      {!authConfigured ? <p className="m-0 mt-2 text-[11px] text-[#888]" role="status">{copy.unavailable}</p> : null}
      {formError || error ? <p className="m-0 mt-2 text-[11px] text-[#b42318]" role="alert">{formError ?? error}</p> : null}
      {notice ? <p className="m-0 mt-2 text-[11px] text-[#39734b]" role="status">{notice}</p> : null}

      {mode !== "forgot" ? (
        <>
          <div className="my-3 flex w-full items-center gap-3 text-[11px] text-[#999]" aria-hidden="true">
            <Separator className="flex-1" />
            <span>{copy.or}</span>
            <Separator className="flex-1" />
          </div>
          <Button variant="outline" className="w-full" style={{ fontSize: "12px" }} onClick={onGoogleSignIn} disabled={busy || !authConfigured}>
            <GoogleMark />{googlePending ? copy.opening : copy.google}
          </Button>
          <Button
            variant="ghost"
            className="mt-1 w-full border-0 bg-transparent p-0 text-[#777] shadow-none hover:bg-transparent"
            style={{ minHeight: 0, fontSize: "12px", border: 0, background: "transparent", boxShadow: "none" }}
            onClick={onContinueAsGuest}
            disabled={busy}
          >
            {copy.continueGuest}
          </Button>
          <p className="m-0 mt-3 text-[10px] leading-4 text-[#999]">
            {copy.terms}<span className="px-1.5" aria-hidden="true">·</span>{copy.privacy}
          </p>
        </>
      ) : null}
    </div>
  );
}
