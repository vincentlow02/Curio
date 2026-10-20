"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogIn, LogOut, Settings2, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/auth-provider";
import { clearOAuthConversationDraft } from "../../features/analysis/services/conversation-service";
import type { UiLocale } from "../../features/analysis/locales";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { LoginForm } from "./login-form";
import { Separator } from "./separator";
import { SettingsDropdown } from "./settings-dropdown";

const labels = {
  en: {
    guest: "Guest",
    signIn: "Log in",
    settings: "Settings",
    close: "Close",
    signOut: "Sign out",
    save: "Save this conversation",
    preferences: "Make Curio feel like home.",
    language: "Language",
    languageHelp: "Choose the language used throughout Curio.",
    location: "Location",
    tokyo: "Tokyo, Japan",
    locationHelp: "Collectible research currently covers Tokyo only.",
    busy: "Language can be changed after this analysis finishes.",
    authFailure: "The account action could not be completed.",
    signedIn: "Signed in",
  },
  zh: {
    guest: "访客",
    signIn: "登录",
    settings: "设置",
    close: "关闭",
    signOut: "退出登录",
    save: "保存此对话",
    preferences: "按你的习惯使用 Curio。",
    language: "语言",
    languageHelp: "选择 Curio 的界面和分析语言。",
    location: "地点",
    tokyo: "日本 · 东京",
    locationHelp: "目前收藏品研究仅支持东京地区。",
    busy: "本次分析完成后即可切换语言。",
    authFailure: "无法完成账户操作。",
    signedIn: "已登录",
  },
  ja: {
    guest: "ゲスト",
    signIn: "ログイン",
    settings: "設定",
    close: "閉じる",
    signOut: "ログアウト",
    save: "この会話を保存",
    preferences: "Curio をあなた好みに。",
    language: "言語",
    languageHelp: "Curio の表示と分析に使う言語を選択します。",
    location: "地域",
    tokyo: "日本・東京",
    locationHelp: "現在、コレクション調査は東京のみ対応しています。",
    busy: "分析が完了すると言語を変更できます。",
    authFailure: "アカウント操作を完了できませんでした。",
    signedIn: "ログイン中",
  },
};

function getMetadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function AccountSettings({
  locale,
  onLocaleChange,
  languageDisabled,
  hasConversation,
  onSaveConversation,
}: {
  locale: UiLocale;
  onLocaleChange: (locale: UiLocale) => void;
  languageDisabled: boolean;
  hasConversation: boolean;
  onSaveConversation: () => void;
}): React.ReactElement {
  const [loginOpen, setLoginOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsSelect, setActiveSettingsSelect] = useState<"language" | "location" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const {
    user,
    authConfigured,
    error: authError,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    requestPasswordReset,
    signOut,
  } = useAuth();
  const copy = labels[locale];
  const fullName = getMetadataString(user?.user_metadata.full_name);
  const avatarUrl = getMetadataString(user?.user_metadata.avatar_url)
    ?? getMetadataString(user?.user_metadata.picture);
  const displayName = fullName ?? user?.email ?? copy.guest;

  useEffect(() => {
    if (user) {
      setLoginOpen(false);
      setActionPending(false);
    }
  }, [user]);

  function requestSignIn(): void {
    setActionError(null);
    try {
      if (hasConversation) onSaveConversation();
      setLoginOpen(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.authFailure);
      setLoginOpen(true);
    }
  }

  async function handleGoogleSignIn(): Promise<void> {
    setActionError(null);
    if (!authConfigured) {
      setActionError("Google sign-in is not configured for this deployment.");
      return;
    }
    setActionPending(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.authFailure);
      setActionPending(false);
    }
  }

  async function handlePasswordSignIn(email: string, password: string): Promise<void> {
    setActionError(null);
    setActionPending(true);
    try {
      await signInWithPassword(email, password);
      setLoginOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.authFailure);
      throw error;
    } finally {
      setActionPending(false);
    }
  }

  async function handlePasswordSignUp(email: string, password: string): Promise<boolean> {
    setActionError(null);
    setActionPending(true);
    try {
      const confirmationRequired = await signUpWithPassword(email, password);
      if (!confirmationRequired) setLoginOpen(false);
      return confirmationRequired;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.authFailure);
      throw error;
    } finally {
      setActionPending(false);
    }
  }

  async function handlePasswordReset(email: string): Promise<void> {
    setActionError(null);
    setActionPending(true);
    try {
      await requestPasswordReset(email);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.authFailure);
      throw error;
    } finally {
      setActionPending(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    setActionError(null);
    setActionPending(true);
    try {
      await signOut();
      setMenuOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.authFailure);
      setMenuOpen(true);
    } finally {
      setActionPending(false);
    }
  }

  function closeLogin(open: boolean): void {
    setLoginOpen(open);
    if (!open) {
      setActionError(null);
      setActionPending(false);
    }
  }

  function continueAsGuest(): void {
    clearOAuthConversationDraft();
    closeLogin(false);
  }

  return (
    <>
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="curio-account flex min-h-[44px] w-full cursor-pointer items-center gap-[9px] rounded-[10px] border-0 bg-transparent px-0 py-[7px] text-left text-[#303030] hover:bg-[#ededed] focus-visible:outline-2 focus-visible:outline-[#e98470] focus-visible:outline-offset-[3px]"
            aria-label={user ? `${copy.settings}: ${displayName}` : copy.signIn}
          >
            <Avatar className="curio-account__avatar ml-[-3px] grid size-[28px] flex-none place-items-center overflow-hidden rounded-full bg-[#ededed] text-[#777]">
              <AvatarImage src={avatarUrl ?? undefined} alt="" className="size-full object-cover" />
              <AvatarFallback><UserRound aria-hidden="true" size={18} /></AvatarFallback>
            </Avatar>
            <span className="curio-account__copy hidden min-w-0 flex-1">
              <b className="block truncate text-[13px] font-medium leading-[19px]">{displayName}</b>
              <small className="block text-[11px] leading-[17px] text-[#929292]">{user ? copy.signedIn : copy.signIn}</small>
            </span>
            <Settings2 className="curio-account__icon mr-[6px] hidden size-[18px] flex-none text-[#999]" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            side="right"
            sideOffset={8}
            collisionPadding={12}
            className="z-[110] w-[min(260px,calc(100vw-24px))] rounded-[14px] border border-[#e7e7e7] bg-white p-1.5 text-[#292929] shadow-[0_12px_36px_#0002]"
          >
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar className="grid size-9 flex-none place-items-center overflow-hidden rounded-full bg-[#f1f1f1] text-[#777]">
                <AvatarImage src={avatarUrl ?? undefined} alt="" className="size-full object-cover" />
                <AvatarFallback><UserRound aria-hidden="true" size={18} /></AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{displayName}</p>
                {user?.email ? <p className="truncate text-[12px] text-[#888]">{user.email}</p> : null}
              </div>
            </div>
            <Separator className="my-1" />
            {!user ? (
              <>
                <DropdownMenu.Item
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-[13px] outline-none hover:bg-[#f4f4f4] data-[highlighted]:bg-[#f4f4f4]"
                  onSelect={requestSignIn}
                >
                  <LogIn size={16} aria-hidden="true" />{copy.signIn}
                </DropdownMenu.Item>
                {hasConversation ? (
                  <DropdownMenu.Item
                    className="flex h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-[13px] outline-none hover:bg-[#f4f4f4] data-[highlighted]:bg-[#f4f4f4]"
                    onSelect={requestSignIn}
                  >
                    <LogIn size={16} aria-hidden="true" />{copy.save}
                  </DropdownMenu.Item>
                ) : null}
                <Separator className="my-1" />
              </>
            ) : null}
            {authError || actionError ? (
              <p className="mx-2.5 my-2 text-[12px] leading-5 text-[#b42318]" role="alert">{actionError ?? authError}</p>
            ) : null}
            <DropdownMenu.Item
              className="flex h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-[13px] outline-none hover:bg-[#f4f4f4] data-[highlighted]:bg-[#f4f4f4]"
              onSelect={() => setSettingsOpen(true)}
            >
              <Settings2 size={16} aria-hidden="true" />{copy.settings}
            </DropdownMenu.Item>
            {user ? (
              <DropdownMenu.Item
                className="flex h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-[13px] text-[#444] outline-none hover:bg-[#f4f4f4] data-[highlighted]:bg-[#f4f4f4] data-[disabled]:opacity-50"
                disabled={actionPending}
                onSelect={(event) => { event.preventDefault(); void handleSignOut(); }}
              >
                <LogOut size={16} aria-hidden="true" />{copy.signOut}
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog open={loginOpen} onOpenChange={closeLogin}>
        <DialogContent className="w-[min(360px,calc(100vw-32px))] p-5 sm:p-6">
          <DialogClose asChild>
            <button
              type="button"
              aria-label={copy.close}
              className="absolute right-4 top-4 grid size-8 appearance-none place-items-center rounded-full border-0 bg-transparent p-0 text-[#777] shadow-none hover:bg-[#f4f4f4] focus-visible:outline-2 focus-visible:outline-[#e98470]"
            >
              <X size={17} />
            </button>
          </DialogClose>
          <LoginForm
            locale={locale}
            authConfigured={authConfigured}
            pending={actionPending}
            error={actionError ?? authError}
            onGoogleSignIn={() => void handleGoogleSignIn()}
            onContinueAsGuest={continueAsGuest}
            onSignIn={handlePasswordSignIn}
            onSignUp={handlePasswordSignUp}
            onRequestPasswordReset={handlePasswordReset}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          className="w-[min(480px,calc(100vw-32px))] p-6 sm:p-7"
          onEscapeKeyDown={(event) => {
            if (activeSettingsSelect) {
              event.preventDefault();
              setActiveSettingsSelect(null);
            }
          }}
        >
          <header className="mb-6 flex items-start justify-between gap-5">
            <div>
              <DialogTitle className="text-[22px] font-semibold tracking-[-.5px]">{copy.settings}</DialogTitle>
              <DialogDescription className="mt-2 text-[13px] leading-[1.5] text-[#888]">{copy.preferences}</DialogDescription>
            </div>
            <DialogClose asChild>
              <button type="button" className="grid size-[30px] flex-none place-items-center rounded-full bg-[#f5f5f5] text-[#777] hover:bg-[#ededed]" aria-label={copy.close}>
                <X size={18} />
              </button>
            </DialogClose>
          </header>
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-[10px] py-4">
            <label htmlFor="curio-settings-language" className="text-[14px] font-medium">{copy.language}</label>
            <SettingsDropdown
              id="curio-settings-language"
              label={copy.language}
              value={locale}
              disabled={languageDisabled}
              open={activeSettingsSelect === "language"}
              onOpenChange={(open) => setActiveSettingsSelect(open ? "language" : null)}
              onChange={(value) => onLocaleChange(value as UiLocale)}
              options={[{ value: "en", label: "English" }, { value: "zh", label: "简体中文" }, { value: "ja", label: "日本語" }]}
            />
            <p className="col-span-full m-0 text-[12px] leading-[1.6] text-[#888]">{languageDisabled ? copy.busy : copy.languageHelp}</p>
          </div>
          <Separator />
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-[10px] py-4">
            <label htmlFor="curio-settings-location" className="text-[14px] font-medium">{copy.location}</label>
            <SettingsDropdown
              id="curio-settings-location"
              label={copy.location}
              value="tokyo"
              open={activeSettingsSelect === "location"}
              onOpenChange={(open) => setActiveSettingsSelect(open ? "location" : null)}
              onChange={() => undefined}
              options={[{ value: "tokyo", label: copy.tokyo }]}
            />
            <p className="col-span-full m-0 text-[12px] leading-[1.6] text-[#888]">{copy.locationHelp}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
