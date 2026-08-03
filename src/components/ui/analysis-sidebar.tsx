"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { RecentAnalysisRecord } from "../../features/analysis/components/analysis-composer";
import { uiCopy, type UiLocale } from "../../features/analysis/locales";
import { LanguageSwitcher } from "./language-switcher";

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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const visibleHistory = query.trim()
    ? history.filter((record) => record.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : history;

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = (): void => {
      setOpenMenuId(null);
      setMenuPosition(null);
    };
    document.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openMenuId]);

  const closeHistoryMenu = (): void => {
    setOpenMenuId(null);
    setMenuPosition(null);
  };

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
                    onClick={() => { closeHistoryMenu(); onOpenHistory(record); if (isMobileViewport() && expanded) onToggle(); }}
                    tabIndex={expanded ? 0 : -1}
                  >
                    <span>{record.title}</span>
                  </button>
                  {record.status && !["identified", "completed", "needs_review", "failed"].includes(record.status) ? <span className="figma-toolbar-history-running" aria-label="Analysis running" title="Analysis running" /> : null}
                  <button
                    className="figma-toolbar-history-item__more"
                    type="button"
                    aria-label={`More options for ${record.title}`}
                    aria-expanded={openMenuId === record.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (openMenuId === record.id) {
                        closeHistoryMenu();
                        return;
                      }
                      const anchor = event.currentTarget.getBoundingClientRect();
                      setMenuPosition({ left: Math.min(anchor.right + 9, window.innerWidth - 101), top: anchor.top - 2 });
                      setOpenMenuId(record.id);
                    }}
                    tabIndex={expanded ? 0 : -1}
                  >⋯</button>
                  {openMenuId === record.id && menuPosition && typeof document !== "undefined" ? createPortal(
                    <div
                      className="figma-toolbar-history-menu figma-toolbar-history-menu--floating"
                      role="menu"
                      style={{ left: menuPosition.left, top: menuPosition.top }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button type="button" role="menuitem" onClick={() => { closeHistoryMenu(); onDeleteHistory(record.id); }}>{copy.delete}</button>
                    </div>,
                    document.body,
                  ) : null}
                </div>
              )) : <p>{history.length ? copy.noMatches : copy.noAnalyses}</p>}
            </nav>
          </div>
        </div>
        <div className="figma-toolbar-footer">
          <LanguageSwitcher locale={locale} onChange={onLocaleChange} placement="mobile" disabled={languageDisabled} />
          <div className="figma-toolbar-location" title="Tokyo, Japan" aria-label="Recommendation area: Tokyo, Japan">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s6-5.14 6-11a6 6 0 1 0-12 0c0 5.86 6 11 6 11Z" />
              <circle cx="12" cy="10" r="2.25" />
            </svg>
            <span><b>Tokyo</b><small>Japan</small></span>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
