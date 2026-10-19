"use client";

import { useRef, useState } from "react";
import { LogIn, LogOut, Settings2, UserRound, X } from "lucide-react";
import { useAuth } from "../auth/auth-provider";
import { SettingsDropdown } from "./settings-dropdown";
import { Icon } from "./icon";
import type { UiLocale } from "../../features/analysis/locales";

const labels = {
  en: { guest: "Guest", local: "Not signed in", settings: "Settings", close: "Close settings", preferences: "Make Curio feel like home.", language: "Language", languageHelp: "Choose the language used throughout Curio.", location: "Location", tokyo: "Tokyo, Japan", locationHelp: "Collectible research currently covers Tokyo only.", busy: "Language can be changed after this analysis finishes.", saved: "Preferences are saved automatically on this device.", signIn: "Continue with Google", signOut: "Sign out", save: "Save this conversation", continue: "Continue without saving", unavailable: "Google sign-in is not configured for this deployment.", saving: "Preparing sign-in…", signedIn: "Signed in with Google", authFailure: "The account action could not be completed." },
  zh: { guest: "访客", local: "尚未登录", settings: "设置", close: "关闭设置", preferences: "按你的习惯使用 Curio。", language: "语言", languageHelp: "选择 Curio 的界面和分析语言。", location: "地点", tokyo: "日本 · 东京", locationHelp: "目前收藏品研究仅支持东京地区。", busy: "本次分析完成后即可切换语言。", saved: "偏好设置会自动保存在此设备上。", signIn: "使用 Google 继续", signOut: "退出登录", save: "保存此对话", continue: "继续使用（不保存）", unavailable: "此部署尚未配置 Google 登录。", saving: "正在准备登录…", signedIn: "已使用 Google 登录", authFailure: "无法完成账户操作。" },
  ja: { guest: "ゲスト", local: "未ログイン", settings: "設定", close: "設定を閉じる", preferences: "Curio をあなた好みに。", language: "言語", languageHelp: "Curio の表示と分析に使う言語を選択します。", location: "地域", tokyo: "日本・東京", locationHelp: "現在、コレクション調査は東京のみ対応しています。", busy: "分析が完了すると言語を変更できます。", saved: "設定はこのデバイスに自動保存されます。", signIn: "Google で続行", signOut: "ログアウト", save: "この会話を保存", continue: "保存せずに続行", unavailable: "このデプロイでは Google ログインが設定されていません。", saving: "ログインを準備中…", signedIn: "Google でログイン中", authFailure: "アカウント操作を完了できませんでした。" },
};

export function AccountSettings({ locale, onLocaleChange, languageDisabled, hasConversation, onSaveConversation }: { locale: UiLocale; onLocaleChange: (locale: UiLocale) => void; languageDisabled: boolean; hasConversation: boolean; onSaveConversation: () => void }): React.ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const { user, authConfigured, error: authError, signInWithGoogle, signOut } = useAuth();
  const copy = labels[locale];
  async function saveAndSignIn(): Promise<void> {
    setActionError(null);
    if (!authConfigured) {
      setActionError(copy.unavailable);
      return;
    }
    setActionPending(true);
    try {
      onSaveConversation();
      await signInWithGoogle();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.authFailure);
      setActionPending(false);
    }
  }

  async function signOutUser(): Promise<void> {
    setActionError(null);
    setActionPending(true);
    try {
      await signOut();
      dialog.current?.close();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.authFailure);
    } finally {
      setActionPending(false);
    }
  }

  return <>
    <button type="button" className="curio-account flex min-h-[44px] w-full cursor-pointer items-center gap-[9px] rounded-[10px] border-0 bg-transparent px-0 py-[7px] text-left text-[#303030] hover:bg-[#ededed] focus-visible:outline-2 focus-visible:outline-[#e98470] focus-visible:outline-offset-[3px]" aria-label={copy.settings} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
      <span className="curio-account__avatar ml-[-3px] grid size-[28px] flex-none place-items-center rounded-full bg-[#ededed] text-[#777]" aria-hidden="true"><Icon icon={UserRound} size={18} /></span>
      <span className="curio-account__copy hidden min-w-0 flex-1"><b className="block truncate text-[13px] font-medium leading-[19px]">{user?.user_metadata.full_name || user?.email || copy.guest}</b><small className="block text-[11px] leading-[17px] text-[#929292]">{user ? copy.signedIn : copy.local}</small></span>
      <Icon icon={Settings2} className="curio-account__icon mr-[6px] hidden size-[18px] flex-none text-[#999]" size={18} />
    </button>
    <dialog ref={dialog} className="curio-settings max-h-[calc(100svh-40px)] w-[min(480px,calc(100vw-32px))] rounded-[20px] border border-[#e7e7e7] bg-white p-[28px] text-[#292929] shadow-[0_24px_90px_#0002]" aria-labelledby="curio-settings-title" onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close(); } }}>
      <header className="mb-[26px] flex items-start justify-between gap-[20px]"><div><h2 id="curio-settings-title" className="m-0 text-[22px] font-semibold tracking-[-.5px]">{copy.settings}</h2><p className="mt-[8px] mb-0 text-[13px] leading-[1.5] text-[#888]">{copy.preferences}</p></div><button type="button" className="curio-settings__close grid size-[30px] cursor-pointer flex-none place-items-center rounded-full border-0 bg-[#f5f5f5] p-0 text-[#777] focus-visible:outline-2 focus-visible:outline-[#e98470] focus-visible:outline-offset-[3px]" aria-label={copy.close} onClick={() => dialog.current?.close()} autoFocus><Icon icon={X} size={18} /></button></header>
      <section className="mb-5 border-b border-[#eee] pb-5">
        {user ? (
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] text-[#555]">{user.email || copy.signedIn}</span>
            <button type="button" className="flex h-9 flex-none items-center gap-2 rounded-[9px] border border-[#e5e5e5] bg-white px-3 text-[13px] text-[#444] hover:bg-[#f7f7f7] disabled:opacity-50" onClick={() => void signOutUser()} disabled={actionPending}>
              <Icon icon={LogOut} size={16} />{copy.signOut}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hasConversation ? <button type="button" className="flex h-10 items-center gap-2 rounded-[9px] border-0 bg-[#222] px-3 text-[13px] font-medium text-white hover:bg-[#393939] disabled:opacity-60" onClick={() => void saveAndSignIn()} disabled={actionPending || !authConfigured}>
              <Icon icon={LogIn} size={16} />{actionPending ? copy.saving : copy.save}
            </button> : null}
            <button type="button" className="flex h-10 items-center gap-2 rounded-[9px] border border-[#e5e5e5] bg-white px-3 text-[13px] text-[#444] hover:bg-[#f7f7f7] disabled:opacity-60" onClick={() => void signInWithGoogle().catch((error: unknown) => setActionError(error instanceof Error ? error.message : copy.authFailure))} disabled={actionPending || !authConfigured}>
              <Icon icon={LogIn} size={16} />{copy.signIn}
            </button>
            {!authConfigured ? <p className="basis-full m-0 text-[12px] text-[#888]">{copy.unavailable}</p> : null}
          </div>
        )}
        {actionError || authError ? <p className="mt-3 mb-0 text-[12px] text-[#b42318]" role="alert">{actionError || authError}</p> : null}
        {!user && hasConversation ? <button type="button" className="mt-3 border-0 bg-transparent p-0 text-[12px] text-[#888] underline underline-offset-2 hover:text-[#444]" onClick={() => dialog.current?.close()}>{copy.continue}</button> : null}
      </section>
      <div className="curio-settings__row grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-[10px] border-t border-[#eee] py-5"><label htmlFor="curio-settings-language" className="text-[14px] font-medium">{copy.language}</label><SettingsDropdown id="curio-settings-language" label={copy.language} value={locale} disabled={languageDisabled} onChange={(value) => onLocaleChange(value as UiLocale)} options={[{ value: "en", label: "English" }, { value: "zh", label: "简体中文" }, { value: "ja", label: "日本語" }]} /><p className="col-span-full m-0 text-[12px] leading-[1.6] text-[#888]">{languageDisabled ? copy.busy : copy.languageHelp}</p></div>
      <div className="curio-settings__row grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-[10px] border-t border-[#eee] py-5"><label htmlFor="curio-settings-location" className="text-[14px] font-medium">{copy.location}</label><SettingsDropdown id="curio-settings-location" label={copy.location} value="tokyo" onChange={() => undefined} options={[{ value: "tokyo", label: copy.tokyo }]} /><p className="col-span-full m-0 text-[12px] leading-[1.6] text-[#888]">{copy.locationHelp}</p></div>
    </dialog>
  </>;
}
