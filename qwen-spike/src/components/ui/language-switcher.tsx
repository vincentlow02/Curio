"use client";

import type { UiLocale } from "../../features/analysis/locales";

type Props = {
  locale: UiLocale;
  onChange: (locale: UiLocale) => void;
  placement: "desktop" | "mobile";
};

const options: Array<{ locale: UiLocale; label: string; ariaLabel: string }> = [
  { locale: "en", label: "EN", ariaLabel: "English" },
  { locale: "zh", label: "中", ariaLabel: "中文" },
  { locale: "ja", label: "日", ariaLabel: "日本語" },
];

export function LanguageSwitcher({ locale, onChange, placement }: Props): React.ReactElement {
  return (
    <div className={`figma-language-switcher is-${placement}`} role="group" aria-label="Language">
      {options.map((option) => (
        <button
          className={locale === option.locale ? "is-active" : ""}
          type="button"
          key={option.locale}
          lang={option.locale === "zh" ? "zh-CN" : option.locale}
          aria-label={option.ariaLabel}
          aria-pressed={locale === option.locale}
          onClick={() => onChange(option.locale)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
