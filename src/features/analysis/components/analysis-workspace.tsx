"use client";

import { useCallback, useEffect, useState } from "react";
import { AnalysisSidebar } from "../../../components/ui/analysis-sidebar";
import { AnalysisRun } from "./analysis-run";
import { useAnalysisHistory } from "../hooks/use-analysis-history";
import { HISTORY_STORAGE_KEY } from "../services/history-service";
import type { UiLocale } from "../locales";

const LOCALE_STORAGE_KEY = "curio-ui-locale";

export function AnalysisWorkspace(): React.ReactElement {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [locale, setLocale] = useState<UiLocale>("en");
  const [languageDisabled, setLanguageDisabled] = useState(false);
  const {
    history,
    selectedHistory,
    analysisRunKey,
    saveHistory,
    promoteHistory,
    startNewChat,
    openHistory,
    deleteHistory,
  } = useAnalysisHistory();

  useEffect(() => {
    try {
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
    if (languageDisabled) return;
    setLocale(nextLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : nextLocale;
  };

  return (
    <div className={`figma-home-experience ${sidebarExpanded ? "is-sidebar-expanded" : ""}`}>
      <AnalysisSidebar
        expanded={sidebarExpanded}
        locale={locale}
        history={history}
        activeHistoryId={selectedHistory?.id ?? null}
        onToggle={() => setSidebarExpanded((current) => !current)}
        onNewChat={startNewChat}
        onOpenHistory={openHistory}
        onDeleteHistory={deleteHistory}
        onLocaleChange={changeLocale}
        languageDisabled={languageDisabled}
      />
      <AnalysisRun key={analysisRunKey} locale={locale} initialHistory={selectedHistory} onHistorySave={saveHistory} onHistoryPromote={promoteHistory} onBusyChange={setLanguageDisabled} />
    </div>
  );
}
