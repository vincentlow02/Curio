"use client";

import { useEffect, useState } from "react";
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
    historyError,
    legacyCleanupDone,
    analysisRunKey,
    saveHistory,
    prepareOAuthSave,
    retryHistory,
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
        onSaveConversation={prepareOAuthSave}
        onLocaleChange={changeLocale}
        languageDisabled={languageDisabled}
      />
      {historyError ? <div className="fixed top-3 left-1/2 z-[110] flex max-w-[min(640px,calc(100vw-24px))] -translate-x-1/2 items-center gap-3 rounded-[10px] border border-[#ecd0cd] bg-white px-4 py-3 text-[12px] text-[#7c241c] shadow-lg" role="alert">
        <span>{historyError}</span>
        <button type="button" className="flex-none border-0 bg-transparent p-0 text-inherit underline underline-offset-2" onClick={retryHistory}>Retry</button>
      </div> : null}
      {legacyCleanupDone ? <AnalysisRun
          key={analysisRunKey}
          locale={locale}
          initialHistory={selectedHistory?.messages.slice().reverse().find((message) => message.role === "assistant" && message.metadata)?.metadata ?? null}
          initialConversation={selectedHistory}
          onHistorySave={saveHistory}
          onBusyChange={setLanguageDisabled}
        /> : <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] text-[#777]" role="status">Preparing Curio…</div>}
    </div>
  );
}
