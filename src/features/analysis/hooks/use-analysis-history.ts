"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecentAnalysisRecord } from "../types";
import {
  deleteAnalysisHistory,
  loadAnalysisHistory,
  promoteAnalysisHistory,
  saveAnalysisHistory,
} from "../services/history-service";

export function useAnalysisHistory() {
  const [history, setHistory] = useState<RecentAnalysisRecord[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<RecentAnalysisRecord | null>(null);
  const [analysisRunKey, setAnalysisRunKey] = useState(0);
  const historyRef = useRef(history);

  useEffect(() => {
    const loaded = loadAnalysisHistory();
    historyRef.current = loaded;
    setHistory(loaded);
  }, []);

  const updateHistory = useCallback((next: RecentAnalysisRecord[]): void => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  const saveHistory = useCallback((record: RecentAnalysisRecord): void => {
    const next = saveAnalysisHistory(historyRef.current, record);
    updateHistory(next);
    setSelectedHistory(record);
  }, [updateHistory]);

  const promoteHistory = useCallback((id: string): void => {
    updateHistory(promoteAnalysisHistory(historyRef.current, id));
  }, [updateHistory]);

  const startNewChat = useCallback((): void => {
    setSelectedHistory(null);
    setAnalysisRunKey((current) => current + 1);
  }, []);

  const openHistory = useCallback((record: RecentAnalysisRecord): void => {
    setSelectedHistory(record);
    setAnalysisRunKey((current) => current + 1);
  }, []);

  const deleteHistory = useCallback((id: string): void => {
    updateHistory(deleteAnalysisHistory(historyRef.current, id));
    if (selectedHistory?.id === id) {
      setSelectedHistory(null);
      setAnalysisRunKey((current) => current + 1);
    }
  }, [selectedHistory?.id, updateHistory]);

  return {
    history,
    selectedHistory,
    analysisRunKey,
    saveHistory,
    promoteHistory,
    startNewChat,
    openHistory,
    deleteHistory,
  };
}
