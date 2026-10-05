"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import type { RecentAnalysisRecord } from "../../features/analysis/components/analysis-composer";
import { uiCopy, type UiLocale } from "../../features/analysis/locales";
import { AccountSettings } from "./account-settings";

type AnalysisSidebarProps = {
  expanded: boolean;
  locale: UiLocale;
  history: RecentAnalysisRecord[];
  activeHistoryId: string | null;
  onToggle: () => void;
  onNewChat: () => void;
  onOpenHistory: (record: RecentAnalysisRecord) => void;
  onDeleteHistory: (id: string) => void;
  onLocaleChange: (locale: UiLocale) => void;
  languageDisabled?: boolean;
};

export function AnalysisSidebar({ expanded, locale, history, activeHistoryId, onToggle, onNewChat, onOpenHistory, onDeleteHistory, onLocaleChange, languageDisabled = false }: AnalysisSidebarProps): React.ReactElement {
  const copy = uiCopy[locale];
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const visibleHistory = query.trim()
    ? history.filter((record) => record.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : history;

  const isMobileViewport = (): boolean => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

  return (
    <>
      {expanded ? <button className="figma-toolbar-backdrop" type="button" aria-label="Close navigation" onClick={onToggle} /> : null}
      <aside className={`figma-left-toolbar ${expanded ? "is-expanded" : ""}`} aria-label="Primary tools" data-node-id={expanded ? "18:581" : "15:529"}>
      <button className="figma-toolbar-mobile-toggle" type="button" aria-label="Close navigation" aria-expanded={expanded} onClick={onToggle}>
        <img src="/figma/sidebar-collapse.svg" alt="" />
      </button>
      <button className="figma-toolbar-brand" type="button" aria-label={expanded ? "Curio" : "Open navigation"} onClick={() => { if (!expanded) onToggle(); }}>
        <span className="figma-toolbar-brand__icon"><img src="/brands/curio-logo.png" alt="" /></span>
        <span className="figma-toolbar-brand__wordmark"><img src="/brands/curio-logo.png" alt="" /></span>
      </button>
      <div className="figma-left-toolbar__content" data-node-id="15:528">
        <div className="figma-left-toolbar__tools" data-node-id="15:527">
          <button className="figma-toolbar-row figma-toolbar-row--new" type="button" aria-label="New chat" aria-expanded={expanded} onClick={() => { onNewChat(); if (isMobileViewport()) { if (expanded) onToggle(); } else if (!expanded) onToggle(); }}>
            <img src="/figma/toolbar-edit.svg" alt="" />
            <span>{copy.newChat}</span>
          </button>
          <button className="figma-toolbar-row figma-toolbar-row--search" type="button" aria-label="Search" onClick={() => { if (!expanded) onToggle(); setSearching((current) => !current); }}>
            <img src="/figma/toolbar-search.svg" alt="" />
            <span>{copy.search}</span>
          </button>
          {expanded && searching ? (
            <input
              className="figma-toolbar-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchRecent}
              aria-label="Search recent analyses"
              autoFocus
            />
          ) : null}
          <div className="figma-toolbar-recent-section">
            <p className="figma-toolbar-recent">{copy.recent}</p>
            <nav className="figma-toolbar-history" aria-label="Recent analyses">
              {visibleHistory.length ? visibleHistory.map((record) => (
                <div className={`figma-toolbar-history-item${record.id === activeHistoryId ? " is-active" : ""}${record.status && !["identified", "completed", "needs_review", "failed"].includes(record.status) ? " is-running" : ""}`} key={record.id}>
                  <button
                    className="figma-toolbar-history-item__open"
                    type="button"
                    title={record.title}
                    onClick={() => { onOpenHistory(record); if (isMobileViewport() && expanded) onToggle(); }}
                    tabIndex={expanded ? 0 : -1}
                  >
                    <span>{record.title}</span>
                  </button>
                  {record.status && !["identified", "completed", "needs_review", "failed"].includes(record.status) ? <span className="figma-toolbar-history-running" aria-label="Analysis running" title="Analysis running" /> : null}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        className="figma-toolbar-history-item__more"
                        type="button"
                        aria-label={`More options for ${record.title}`}
                        tabIndex={expanded ? 0 : -1}
                      >⋯</button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className="figma-toolbar-history-menu z-[100] w-[92px] rounded-[9px] border border-[#e2e2e2] bg-white p-[4px] shadow-[0_7px_20px_rgba(0,0,0,0.12)]"
                        side="right"
                        align="start"
                        sideOffset={9}
                        collisionPadding={8}
                      >
                        <DropdownMenu.Item
                          className="figma-toolbar-history-menu__item flex h-[31px] w-full cursor-pointer items-center rounded-[6px] border-0 bg-transparent px-[9px] text-left text-[#c22] outline-none hover:bg-[#fff0f0] data-[highlighted]:bg-[#fff0f0] [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Arial,sans-serif] [font-size:12px] [font-weight:400] [line-height:31px]"
                          onSelect={() => onDeleteHistory(record.id)}
                        >
                          {copy.delete}
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              )) : <p>{history.length ? copy.noMatches : copy.noAnalyses}</p>}
            </nav>
          </div>
        </div>
        <div className="figma-toolbar-footer">
          <AccountSettings locale={locale} onLocaleChange={onLocaleChange} languageDisabled={languageDisabled} />
        </div>
      </div>
      </aside>
    </>
  );
}
