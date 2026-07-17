"use client";

import { useState } from "react";
import { FigmaLeftToolbar } from "../../../components/ui/figma-left-toolbar";
import { FigmaHomeComposer } from "./figma-home-composer";

export function FigmaHomeExperience(): React.ReactElement {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  return (
    <div className={`figma-home-experience ${sidebarExpanded ? "is-sidebar-expanded" : ""}`}>
      <FigmaLeftToolbar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded((current) => !current)} />
      <FigmaHomeComposer />
    </div>
  );
}
