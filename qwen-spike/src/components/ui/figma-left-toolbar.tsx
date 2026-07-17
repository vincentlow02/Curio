"use client";

type FigmaLeftToolbarProps = {
  expanded: boolean;
  onToggle: () => void;
};

export function FigmaLeftToolbar({ expanded, onToggle }: FigmaLeftToolbarProps): React.ReactElement {
  return (
    <aside className={`figma-left-toolbar ${expanded ? "is-expanded" : ""}`} aria-label="Primary tools" data-node-id={expanded ? "18:581" : "15:529"}>
      <div className="figma-left-toolbar__content" data-node-id="15:528">
        <div className="figma-left-toolbar__tools" data-node-id="15:527">
          <button className="figma-toolbar-row figma-toolbar-row--new" type="button" aria-label="New chat" aria-expanded={expanded} onClick={onToggle}>
            <img src="/figma/toolbar-edit.svg" alt="" />
            <span>New chat</span>
          </button>
          <button className="figma-toolbar-row figma-toolbar-row--search" type="button" aria-label="Search" onClick={() => { if (!expanded) onToggle(); }}>
            <img src="/figma/toolbar-search.svg" alt="" />
            <span>Search</span>
          </button>
          <p className="figma-toolbar-recent">Recent</p>
        </div>
        <img className="figma-toolbar-status" src="/figma/toolbar-status.svg" alt="" data-node-id="2:95" />
      </div>
    </aside>
  );
}
