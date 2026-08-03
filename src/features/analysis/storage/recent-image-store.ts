const DATABASE_NAME = "collectible-demo-history";
const DATABASE_VERSION = 1;
const STORE_NAME = "recent-images";

type StoredRecentImage = {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  updatedAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open recent image storage."));
  });
}

async function runTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Recent image storage operation failed."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Recent image storage transaction failed."));
    };
  });
}

export async function saveRecentImage(id: string, file: File): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const record: StoredRecentImage = {
    id,
    blob: file,
    name: file.name,
    type: file.type,
    updatedAt: new Date().toISOString(),
  };
  await runTransaction("readwrite", (store) => store.put(record));
}

export async function loadRecentImage(id: string): Promise<File | null> {
  if (typeof indexedDB === "undefined") return null;
  const record = await runTransaction<StoredRecentImage | undefined>("readonly", (store) => store.get(id));
  if (!record) return null;
  return new File([record.blob], record.name, { type: record.type || record.blob.type });
}

export async function deleteRecentImage(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await runTransaction("readwrite", (store) => store.delete(id));
}
