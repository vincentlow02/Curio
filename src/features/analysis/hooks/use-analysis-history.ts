"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../components/auth/auth-provider";
import type { ConversationMessage, ConversationRecord, ConversationSummary, RecentAnalysisRecord } from "../types";
import { loadAnalysisImage } from "../services/history-service";
import { deleteLegacyAnalysisHistory } from "../services/legacy-history-cleanup";
import {
  clearOAuthConversationDraft,
  deleteConversation,
  getConversation,
  listConversations,
  readOAuthConversationDraft,
  saveConversation,
  saveOAuthConversationDraft,
  uploadConversationImage,
} from "../services/conversation-service";

function buildRunMessages(record: RecentAnalysisRecord, current: ConversationRecord | null): ConversationMessage[] {
  const existing = current?.messages ?? [];
  const priorAssistant = existing.find((message) => message.role === "assistant" && message.metadata?.id === record.id);
  const priorRecord = priorAssistant?.metadata;
  const savedRecord = {
    ...record,
    userMessageId: priorRecord?.userMessageId ?? record.userMessageId ?? crypto.randomUUID(),
    ...(priorRecord?.conversationImagePath && !record.conversationImagePath
      ? { conversationImagePath: priorRecord.conversationImagePath }
      : {}),
  };
  const userMessageId = savedRecord.userMessageId!;
  const userMessage: ConversationMessage = {
    id: userMessageId,
    role: "user",
    content: savedRecord.submittedText || (savedRecord.imageName ? "Uploaded an image" : "Identify this collectible"),
    createdAt: savedRecord.createdAt,
    metadata: null,
    ...(savedRecord.imageName ? { attachmentName: savedRecord.imageName } : {}),
    ...(savedRecord.conversationImagePath ? { attachmentPath: savedRecord.conversationImagePath } : {}),
  };
  const assistantMessage: ConversationMessage = {
    id: savedRecord.id,
    role: "assistant",
    content: savedRecord.title,
    createdAt: new Date(Date.parse(savedRecord.createdAt) + 1).toISOString(),
    metadata: savedRecord,
  };
  const followupMessages = (savedRecord.followups ?? []).flatMap((followup): ConversationMessage[] => [
    { id: followup.userMessageId, role: "user", content: followup.question, createdAt: followup.createdAt, metadata: null },
    { id: followup.assistantMessageId, role: "assistant", content: followup.answer, createdAt: new Date(Date.parse(followup.createdAt) + 1).toISOString(), metadata: null },
  ]);
  const replacedIds = new Set([
    userMessageId,
    savedRecord.id,
    ...(priorRecord?.followups ?? []).flatMap((followup) => [followup.userMessageId, followup.assistantMessageId]),
  ]);
  return [...existing.filter((message) => !replacedIds.has(message.id)), userMessage, assistantMessage, ...followupMessages]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function summarize(conversation: ConversationRecord): ConversationSummary {
  return { id: conversation.id, title: conversation.title, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt };
}

export function useAnalysisHistory() {
  const { user, loading } = useAuth();
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<ConversationRecord | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [legacyCleanupDone, setLegacyCleanupDone] = useState(false);
  const [historyRetryKey, setHistoryRetryKey] = useState(0);
  const [analysisRunKey, setAnalysisRunKey] = useState(0);
  const currentRef = useRef<ConversationRecord | null>(selectedHistory);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const imageUploadsRef = useRef(new Map<string, Promise<string>>());
  const importedDraftUserRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void deleteLegacyAnalysisHistory().then(() => {
      if (!cancelled) setLegacyCleanupDone(true);
    }).catch((error: unknown) => {
      if (!cancelled) setHistoryError(error instanceof Error ? error.message : "Legacy guest history could not be deleted.");
    });
    return () => { cancelled = true; };
  }, [historyRetryKey]);

  const updateCurrent = useCallback((conversation: ConversationRecord | null): void => {
    currentRef.current = conversation;
    setSelectedHistory(conversation);
  }, []);

  const refreshHistory = useCallback(async (): Promise<void> => {
    if (!user) {
      setHistory([]);
      return;
    }
    const summaries = await listConversations();
    setHistory(summaries);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    if (loading) return;
    if (!user) {
      setHistory([]);
      importedDraftUserRef.current = null;
      try {
        const draft = readOAuthConversationDraft();
        if (draft) {
          updateCurrent(draft);
          clearOAuthConversationDraft();
          setAnalysisRunKey((current) => current + 1);
        }
      } catch (error) {
        setHistoryError(error instanceof Error ? error.message : "The sign-in draft could not be restored.");
      }
      return;
    }

    void (async () => {
      try {
        const [summaries] = await Promise.all([listConversations()]);
        if (cancelled) return;
        setHistory(summaries);
        setHistoryError(null);

        if (importedDraftUserRef.current === user.id) return;
        const draft = readOAuthConversationDraft();
        if (!draft) {
          importedDraftUserRef.current = user.id;
          return;
        }
        const persistedDraft = await persistConversation(draft);
        if (cancelled) return;
        clearOAuthConversationDraft();
        importedDraftUserRef.current = user.id;
        updateCurrent(persistedDraft);
        setAnalysisRunKey((current) => current + 1);
        await refreshHistory();
      } catch (error) {
        importedDraftUserRef.current = null;
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : "Saved conversations could not be restored.");
      }
    })();
    return () => { cancelled = true; };
  }, [historyRetryKey, loading, refreshHistory, updateCurrent, user]);

  const prepareOAuthSave = useCallback((): void => {
    const conversation = currentRef.current;
    if (!conversation || conversation.messages.length === 0) throw new Error("There is no conversation to save yet.");
    saveOAuthConversationDraft(conversation);
  }, []);

  const saveHistory = useCallback((record: RecentAnalysisRecord): void => {
    if (!legacyCleanupDone) {
      setHistoryError("The old local history cleanup must finish before saving a conversation.");
      return;
    }
    const current = currentRef.current;
    const messages = buildRunMessages(record, current);
    const savedRecord = messages.find((message) => message.role === "assistant" && message.metadata?.id === record.id)?.metadata;
    if (!savedRecord) return;
    const next: ConversationRecord = {
      id: current?.id ?? crypto.randomUUID(),
      title: current?.title === "Analyzing collectible…" ? savedRecord.title : current?.title ?? savedRecord.title,
      createdAt: current?.createdAt ?? savedRecord.createdAt,
      updatedAt: new Date().toISOString(),
      messages,
    };
    updateCurrent(next);
    if (!user) return;

    const persist = async (): Promise<void> => {
      let snapshot = next;
      const assistantRecords = snapshot.messages
        .filter((message) => message.role === "assistant" && message.metadata?.imageName && !message.metadata.conversationImagePath);
      if (assistantRecords.length) await saveConversation(snapshot);
      for (const assistant of assistantRecords) {
        const metadata = assistant.metadata;
        if (!metadata) continue;
        const file = await loadAnalysisImage(metadata.id);
        if (!file) throw new Error(`The image for "${metadata.title}" is no longer available on this device.`);
        let pathPromise = imageUploadsRef.current.get(metadata.id);
        if (!pathPromise) {
          pathPromise = uploadConversationImage(snapshot.id, file);
          imageUploadsRef.current.set(metadata.id, pathPromise);
          void pathPromise.catch(() => imageUploadsRef.current.delete(metadata.id));
        }
        const path = await pathPromise;
        const updatedMetadata = { ...metadata, conversationImagePath: path };
        snapshot = {
          ...snapshot,
          messages: snapshot.messages.map((message) => message.id === assistant.id
            ? { ...message, metadata: updatedMetadata }
            : message.id === metadata.userMessageId ? { ...message, attachmentPath: path } : message),
        };
      }
      await saveConversation(snapshot);
      if (currentRef.current === next) updateCurrent(snapshot);
      setHistory((currentHistory) => [summarize(snapshot), ...currentHistory.filter((item) => item.id !== snapshot.id)]);
      setHistoryError(null);
    };

    const queued = persistQueueRef.current.then(persist);
    persistQueueRef.current = queued.catch((error: unknown) => {
      setHistoryError(error instanceof Error ? error.message : "The conversation could not be saved. Try again.");
    });
  }, [legacyCleanupDone, updateCurrent, user]);

  const startNewChat = useCallback((): void => {
    updateCurrent(null);
    setAnalysisRunKey((current) => current + 1);
    setHistoryError(null);
  }, [updateCurrent]);

  const openHistory = useCallback(async (record: ConversationSummary): Promise<void> => {
    try {
      const conversation = await getConversation(record.id);
      updateCurrent(conversation);
      setAnalysisRunKey((current) => current + 1);
      setHistoryError(null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "The conversation could not be opened.");
    }
  }, [updateCurrent]);

  const deleteHistory = useCallback(async (id: string): Promise<void> => {
    try {
      await deleteConversation(id);
      setHistory((current) => current.filter((item) => item.id !== id));
      if (currentRef.current?.id === id) startNewChat();
      setHistoryError(null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "The conversation could not be deleted.");
    }
  }, [startNewChat]);

  const retryHistory = useCallback((): void => {
    setHistoryError(null);
    setHistoryRetryKey((current) => current + 1);
    if (user) {
      const latestRecord = currentRef.current?.messages.slice().reverse()
        .find((message) => message.role === "assistant" && message.metadata)?.metadata;
      if (latestRecord) saveHistory(latestRecord);
    }
  }, [saveHistory, user]);

  return {
    history,
    selectedHistory,
    historyError,
    legacyCleanupDone,
    analysisRunKey,
    saveHistory,
    prepareOAuthSave,
    startNewChat,
    openHistory,
    deleteHistory,
    retryHistory,
  };
}

async function persistConversation(conversation: ConversationRecord): Promise<ConversationRecord> {
  const messages: ConversationMessage[] = [...conversation.messages];
  let saved = { ...conversation, messages };
  const assistantRecords = messages.filter((message) => message.role === "assistant" && message.metadata?.imageName && !message.metadata.conversationImagePath);
  if (assistantRecords.length) await saveConversation(saved);
  for (const assistant of assistantRecords) {
    const metadata = assistant.metadata;
    if (!metadata) continue;
    const file = await loadAnalysisImage(metadata.id);
    if (!file) throw new Error(`The image for "${metadata.title}" is no longer available on this device.`);
    const path = await uploadConversationImage(saved.id, file);
    const updatedMetadata = { ...metadata, conversationImagePath: path };
    saved = {
      ...saved,
      messages: saved.messages.map((message) => message.id === assistant.id
        ? { ...message, metadata: updatedMetadata }
        : message.id === metadata.userMessageId ? { ...message, attachmentPath: path } : message),
    };
  }
  await saveConversation(saved);
  return saved;
}
