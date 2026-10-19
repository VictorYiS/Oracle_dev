// Saves in this browser (IndexedDB), one slot per pack. Storage can be missing or blocked
// (private windows, Artifact thumbnails), so every call fails softly and the game carries on.

const DB = "oracle";
const STORE = "saves";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function writeSave(slot: string, save: unknown): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.put(JSON.parse(JSON.stringify(save)), slot));
    return true;
  } catch {
    return false;
  }
}

export async function readSave(slot: string): Promise<unknown> {
  try {
    return (await run("readonly", (s) => s.get(slot))) ?? null;
  } catch {
    return null;
  }
}
