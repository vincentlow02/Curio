import { HISTORY_STORAGE_KEY } from "./history-service";

const IMAGE_DATABASE_NAME = "collectible-demo-history";
const CLEANUP_MARKER = "curio-legacy-history-cleanup-v1";

export async function deleteLegacyAnalysisHistory(): Promise<void> {
  if (localStorage.getItem(CLEANUP_MARKER) === "done") return;
  localStorage.removeItem(HISTORY_STORAGE_KEY);

  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(IMAGE_DATABASE_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Unable to delete legacy analysis images."));
      request.onblocked = () => reject(new Error("Legacy analysis images are still open in another tab. Close other Curio tabs and retry."));
    });
  }
  localStorage.setItem(CLEANUP_MARKER, "done");
}
