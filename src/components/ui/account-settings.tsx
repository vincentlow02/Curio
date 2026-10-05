"use client";

import { useRef } from "react";
import { SettingsDropdown } from "./settings-dropdown";
import type { UiLocale } from "../../features/analysis/locales";

const labels = {
  en: { guest: "Guest", local: "Local profile", settings: "Settings", close: "Close settings", preferences: "Make Curio feel like home.", language: "Language", languageHelp: "Choose the language used throughout Curio.", location: "Location", tokyo: "Tokyo, Japan", locationHelp: "Collectible research currently covers Tokyo only.", busy: "Language can be changed after this analysis finishes.", saved: "Preferences are saved automatically on this device." },
  zh: { guest: "访客", local: "本地账户", settings: "设置", close: "关闭设置", preferences: "按你的习惯使用 Curio。", language: "语言", languageHelp: "选择 Curio 的界面和分析语言。", location: "地点", tokyo: "日本 · 东京", locationHelp: "目前收藏品研究仅支持东京地区。", busy: "本次分析完成后即可切换语言。", saved: "偏好设置会自动保存在此设备上。" },
  ja: { guest: "ゲスト", local: "ローカルプロフィール", settings: "設定", close: "設定を閉じる", preferences: "Curio をあなた好みに。", language: "言語", languageHelp: "Curio の表示と分析に使う言語を選択します。", location: "地域", tokyo: "日本・東京", locationHelp: "現在、コレクション調査は東京のみ対応しています。", busy: "分析が完了すると言語を変更できます。", saved: "設定はこのデバイスに自動保存されます。" },
};

export function AccountSettings({ locale, onLocaleChange, languageDisabled }: { locale: UiLocale; onLocaleChange: (locale: UiLocale) => void; languageDisabled: boolean }): React.ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const copy = labels[locale];
  return <>
    <button type="button" className="curio-account flex min-h-[44px] w-full cursor-pointer items-center gap-[9px] rounded-[10px] border-0 bg-transparent px-0 py-[7px] text-left text-[#303030] hover:bg-[#ededed] focus-visible:outline-2 focus-visible:outline-[#e98470] focus-visible:outline-offset-[3px]" aria-label={copy.settings} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
      <span className="curio-account__avatar ml-[-3px] grid size-[28px] flex-none place-items-center rounded-full bg-[#f69683] text-[11px] text-white" aria-hidden="true">C</span>
      <span className="curio-account__copy hidden min-w-0 flex-1"><b className="block text-[13px] font-medium leading-[19px]">{copy.guest}</b><small className="block text-[11px] leading-[17px] text-[#929292]">{copy.local}</small></span>
      <svg className="curio-account__icon mr-[6px] hidden size-[18px] flex-none text-[#999]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 3-.6 2.1-2 .9-2-.5-2 3.5 1.4 1.6v2.8L2.4 15l2 3.5 2-.5 2 .9L9 21h4l.6-2.1 2-.9 2 .5 2-3.5-1.4-1.6v-2.8l1.4-1.6-2-3.5-2 .5-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>
    </button>
    <dialog ref={dialog} className="curio-settings max-h-[calc(100svh-40px)] w-[min(480px,calc(100vw-32px))] rounded-[20px] border border-[#e7e7e7] bg-white p-[28px] text-[#292929] shadow-[0_24px_90px_#0002]" aria-labelledby="curio-settings-title" onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close(); } }}>
      <header className="mb-[26px] flex items-start justify-between gap-[20px]"><div><h2 id="curio-settings-title" className="m-0 text-[22px] font-semibold tracking-[-.5px]">{copy.settings}</h2><p className="mt-[8px] mb-0 text-[13px] leading-[1.5] text-[#888]">{copy.preferences}</p></div><button type="button" className="curio-settings__close grid size-[30px] cursor-pointer flex-none place-items-center rounded-full border-0 bg-[#f5f5f5] p-0 text-[23px]! text-[#777] focus-visible:outline-2 focus-visible:outline-[#e98470] focus-visible:outline-offset-[3px]" aria-label={copy.close} onClick={() => dialog.current?.close()} autoFocus>×</button></header>
      <div className="curio-settings__row grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-[10px] border-t border-[#eee] py-5"><label htmlFor="curio-settings-language" className="text-[14px] font-medium">{copy.language}</label><SettingsDropdown id="curio-settings-language" label={copy.language} value={locale} disabled={languageDisabled} onChange={(value) => onLocaleChange(value as UiLocale)} options={[{ value: "en", label: "English" }, { value: "zh", label: "简体中文" }, { value: "ja", label: "日本語" }]} /><p className="col-span-full m-0 text-[12px] leading-[1.6] text-[#888]">{languageDisabled ? copy.busy : copy.languageHelp}</p></div>
      <div className="curio-settings__row grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-[10px] border-t border-[#eee] py-5"><label htmlFor="curio-settings-location" className="text-[14px] font-medium">{copy.location}</label><SettingsDropdown id="curio-settings-location" label={copy.location} value="tokyo" onChange={() => undefined} options={[{ value: "tokyo", label: copy.tokyo }]} /><p className="col-span-full m-0 text-[12px] leading-[1.6] text-[#888]">{copy.locationHelp}</p></div>
    </dialog>
  </>;
}
