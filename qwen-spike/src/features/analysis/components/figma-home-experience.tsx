"use client";

import { useCallback, useEffect, useState } from "react";
import { FigmaLeftToolbar } from "../../../components/ui/figma-left-toolbar";
import { LanguageSwitcher } from "../../../components/ui/language-switcher";
import { FigmaLiveComposer, type RecentAnalysisRecord } from "./figma-live-composer";
import { deleteRecentImage } from "../storage/recent-image-store";
import type { UiLocale } from "../locales";

const HISTORY_STORAGE_KEY = "qwen-collectible-recent-v1";
const LOCALE_STORAGE_KEY = "curio-ui-locale";

export function FigmaHomeExperience(): React.ReactElement {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [history, setHistory] = useState<RecentAnalysisRecord[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<RecentAnalysisRecord | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [locale, setLocale] = useState<UiLocale>("en");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]") as unknown;
      if (Array.isArray(stored)) setHistory(stored.slice(0, 12) as RecentAnalysisRecord[]);
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (storedLocale === "en" || storedLocale === "zh" || storedLocale === "ja") {
        setLocale(storedLocale);
        document.documentElement.lang = storedLocale === "zh" ? "zh-CN" : storedLocale;
      }
    } catch {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    }
  }, []);

  const changeLocale = (nextLocale: UiLocale): void => {
    setLocale(nextLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : nextLocale;
  };

  const saveHistory = useCallback((record: RecentAnalysisRecord): void => {
    setSelectedHistory(record);
    setHistory((current) => {
      const existingIndex = current.findIndex((item) => item.id === record.id);
      const next = existingIndex < 0
        ? [record, ...current].slice(0, 12)
        : current.map((item) => item.id === record.id ? record : item);
      const retainedIds = new Set(next.map((item) => item.id));
      for (const removed of current) if (!retainedIds.has(removed.id)) void deleteRecentImage(removed.id).catch(() => undefined);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const promoteHistory = useCallback((id: string): void => {
    setHistory((current) => {
      const record = current.find((item) => item.id === id);
      if (!record || current[0]?.id === id) return current;
      const next = [record, ...current.filter((item) => item.id !== id)];
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const startNewChat = (): void => {
    setSelectedHistory(null);
    setComposerKey((current) => current + 1);
  };

  const openHistory = (record: RecentAnalysisRecord): void => {
    setSelectedHistory(record);
    setComposerKey((current) => current + 1);
  };

  const deleteHistory = (id: string): void => {
    void deleteRecentImage(id).catch(() => undefined);
    setHistory((current) => {
      const next = current.filter((record) => record.id !== id);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    if (selectedHistory?.id === id) {
      setSelectedHistory(null);
      setComposerKey((current) => current + 1);
    }
  };

  return (
    <div className={`figma-home-experience ${sidebarExpanded ? "is-sidebar-expanded" : ""}`}>
      <FigmaLeftToolbar
        expanded={sidebarExpanded}
        locale={locale}
        history={history}
        activeHistoryId={selectedHistory?.id ?? null}
        onToggle={() => setSidebarExpanded((current) => !current)}
        onNewChat={startNewChat}
        onOpenHistory={openHistory}
        onDeleteHistory={deleteHistory}
        onLocaleChange={changeLocale}
      />
      <LanguageSwitcher locale={locale} onChange={changeLocale} placement="desktop" />
      <FigmaLiveComposer key={composerKey} locale={locale} initialHistory={selectedHistory} onHistorySave={saveHistory} onHistoryPromote={promoteHistory} />
    </div>
  );
}
