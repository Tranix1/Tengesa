import * as SQLite from "expo-sqlite";
import { collection, deleteDoc, doc, setDoc } from "firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { db } from "@/db/fireBaseConfig";

export type OfflineWrite = { id: string; path: string; action: "set" | "delete"; payload: string | null; created_at: number };
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeTail: Promise<void> = Promise.resolve();
const queueListeners = new Set<() => void>();
const ownerId = () => getAuth().currentUser?.uid ?? "anonymous";

export function subscribeOfflineQueueChanges(listener: () => void) {
  queueListeners.add(listener);
  return () => { queueListeners.delete(listener); };
}
function notifyQueueChanged() { queueListeners.forEach((listener) => listener()); }

async function database() {
  if (!databasePromise) databasePromise = SQLite.openDatabaseAsync("tengesa-offline.db").then(async (db) => {
    await db.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cached_documents (owner_uid TEXT NOT NULL, path TEXT NOT NULL, collection_name TEXT NOT NULL, document_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner_uid, path));
      CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY NOT NULL, owner_uid TEXT NOT NULL, path TEXT NOT NULL, action TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS cached_collection ON cached_documents(owner_uid, collection_name, updated_at DESC);
      CREATE INDEX IF NOT EXISTS sync_queue_created ON sync_queue(owner_uid, created_at);`);
    return db;
  }).catch((error) => { databasePromise = null; throw error; });
  return databasePromise;
}

async function serialize<T>(work: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const db = await database();
  let release!: () => void;
  const previous = writeTail;
  writeTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await work(db); } finally { release(); }
}

function recordLocation(path: string) {
  const parts = path.split("/");
  return { collectionName: parts.length > 2 ? parts.slice(0, -1).join("/") : parts[0], id: parts.at(-1) ?? "" };
}

export async function saveCachedDocument(path: string, value: Record<string, unknown>) {
  const owner = ownerId();
  const { collectionName, id } = recordLocation(path);
  await serialize(async (db) => { await db.runAsync(`INSERT INTO cached_documents(owner_uid, path, collection_name, document_id, payload, updated_at) VALUES(?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_uid, path) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`, owner, path, collectionName, id, JSON.stringify(value), Date.now()); });
}

export async function getCachedDocuments(collectionName: string) {
  const owner = ownerId();
  return serialize(async (db) => (await db.getAllAsync<{ document_id: string; payload: string }>(
    "SELECT document_id, payload FROM cached_documents WHERE owner_uid = ? AND collection_name = ? ORDER BY updated_at DESC", owner, collectionName,
  )).map((row) => ({ id: row.document_id, ...JSON.parse(row.payload) as Record<string, unknown> })));
}

export async function getCachedDocument(path: string) {
  const owner = ownerId();
  return serialize(async (db) => {
    const row = await db.getFirstAsync<{ payload: string }>("SELECT payload FROM cached_documents WHERE owner_uid = ? AND path = ?", owner, path);
    return row ? JSON.parse(row.payload) as Record<string, unknown> : null;
  });
}

export async function removeCachedDocument(path: string) {
  const owner = ownerId();
  await serialize(async (db) => { await db.runAsync("DELETE FROM cached_documents WHERE owner_uid = ? AND path = ?", owner, path); });
}

export async function queueOfflineWrite(path: string, action: OfflineWrite["action"], payload: Record<string, unknown> | null) {
  const owner = ownerId();
  const id = `${owner}:${path}`;
  const body = payload === null ? null : JSON.stringify(payload);
  await serialize(async (database) => {
    await database.withTransactionAsync(async () => {
      if (action === "delete") await database.runAsync("DELETE FROM cached_documents WHERE owner_uid = ? AND path = ?", owner, path);
      else {
        const { collectionName, id: documentId } = recordLocation(path);
        await database.runAsync(`INSERT INTO cached_documents(owner_uid, path, collection_name, document_id, payload, updated_at) VALUES(?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_uid, path) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`, owner, path, collectionName, documentId, body!, Date.now());
      }
      await database.runAsync(`INSERT INTO sync_queue(id, owner_uid, path, action, payload, created_at) VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET action=excluded.action, payload=excluded.payload, created_at=excluded.created_at`, id, owner, path, action, body, Date.now());
    });
  });
  notifyQueueChanged();
}

export async function getSyncQueue(uid: string) {
  return serialize((db) => db.getAllAsync<OfflineWrite>("SELECT id, path, action, payload, created_at FROM sync_queue WHERE owner_uid = ? ORDER BY created_at ASC", uid));
}

export async function getSyncQueueCount(uid: string) {
  return serialize(async (db) => (await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM sync_queue WHERE owner_uid = ?", uid))?.count ?? 0);
}

export async function synchronizeOfflineWrites(uid: string) {
  const changes = await getSyncQueue(uid);
  for (const change of changes) {
    if (change.action === "delete") await deleteDoc(doc(db, change.path));
    else await setDoc(doc(db, change.path), JSON.parse(change.payload ?? "{}"), { merge: true });
    await serialize(async (database) => { await database.runAsync("DELETE FROM sync_queue WHERE id = ? AND owner_uid = ?", change.id, uid); });
    notifyQueueChanged();
  }
}

export function createOfflineDocumentId(collectionName: string) {
  return doc(collection(db, collectionName)).id;
}

export async function cacheAndQueueWrite(path: string, payload: Record<string, unknown>) {
  await queueOfflineWrite(path, "set", payload);
}
