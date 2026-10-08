"use client";

import { useCallback, useEffect, useState } from "react";
import { AnalysisSidebar } from "../../../components/ui/analysis-sidebar";
import { AnalysisRun } from "./analysis-run";
import { useAnalysisHistory } from "../hooks/use-analysis-history";
import { persistLocale, readStoredLocale } from "../services/locale-storage";
import type { UiLocale } from "../locales";

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
    const storedLocale = readStoredLocale();
    if (storedLocale) {
      setLocale(storedLocale);
      document.documentElement.lang = storedLocale === "zh" ? "zh-CN" : storedLocale;
    }
  }, []);

  const changeLocale = (nextLocale: UiLocale): void => {
    if (languageDisabled) return;
    setLocale(nextLocale);
    persistLocale(nextLocale);
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
