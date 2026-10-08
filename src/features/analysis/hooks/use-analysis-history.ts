"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecentAnalysisRecord } from "../types";
import {
  deleteAnalysisHistory,
  readAnalysisHistory,
  promoteAnalysisHistory,
  saveAnalysisHistory,
} from "../services/history-service";

export function useAnalysisHistory() {
  const [history, setHistory] = useState<RecentAnalysisRecord[]>([]);
  const [historyLoadStatus, setHistoryLoadStatus] = useState<"loading" | "loaded" | "unavailable">("loading");
  const [selectedHistory, setSelectedHistory] = useState<RecentAnalysisRecord | null>(null);
  const [analysisRunKey, setAnalysisRunKey] = useState(0);
  const historyRef = useRef(history);

  useEffect(() => {
    const result = readAnalysisHistory();
    setHistoryLoadStatus(result.status);
    if (result.status === "loaded") {
      historyRef.current = result.records;
      setHistory(result.records);
    }
  }, []);

  const updateHistory = useCallback((next: RecentAnalysisRecord[]): void => {
    historyRef.current = next;
    setHistory(next);
    setHistoryLoadStatus("loaded");
  }, []);

  const saveHistory = useCallback((record: RecentAnalysisRecord): void => {
    const result = saveAnalysisHistory(historyRef.current, record);
    if (result.status === "saved") {
      updateHistory(result.records);
      setSelectedHistory(record);
    } else {
      setHistoryLoadStatus("unavailable");
    }
  }, [updateHistory]);

  const promoteHistory = useCallback((id: string): void => {
    const result = promoteAnalysisHistory(historyRef.current, id);
    if (result.status === "saved") updateHistory(result.records);
    else setHistoryLoadStatus("unavailable");
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
    const result = deleteAnalysisHistory(historyRef.current, id);
    if (result.status === "protected") {
      setHistoryLoadStatus("unavailable");
      return;
    }
    updateHistory(result.records);
    if (selectedHistory?.id === id) {
      setSelectedHistory(null);
      setAnalysisRunKey((current) => current + 1);
    }
  }, [selectedHistory?.id, updateHistory]);

  return {
    history,
    historyLoadStatus,
    selectedHistory,
    analysisRunKey,
    saveHistory,
    promoteHistory,
    startNewChat,
    openHistory,
    deleteHistory,
  };
}
