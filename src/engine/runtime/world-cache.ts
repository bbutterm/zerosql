/**
 * Кеш байтов мира (разд. 6.14, п. 2): IndexedDB под ключом
 * world:<версия генератора>:<зерно>. Промах — мир генерируется заново и
 * кладётся в кеш; старые версии удаляются. Ошибки IndexedDB (приватный режим,
 * квота) считаются промахом: игра работает, только без кеша.
 */
import { WORLD_GENERATOR_VERSION } from "../world/facts";

export interface WorldCache {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
}

export const WORLD_KEY_PREFIX = "world:";

export function worldCacheKey(seed: string | number, version: number = WORLD_GENERATOR_VERSION): string {
  return `${WORLD_KEY_PREFIX}${version}:${seed}`;
}

// --- Память потока ---

const memory = new Map<string, Uint8Array>();

/** Кеш в памяти потока: тесты и внутрипроцессный режим (байты не меняются, только читаются) */
export const memoryWorldCache: WorldCache = {
  async get(key) {
    return memory.get(key) ?? null;
  },
  async put(key, bytes) {
    memory.clear();
    memory.set(key, bytes);
  },
};

// --- IndexedDB ---

export function indexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

const IDB_NAME = "zerosql";
const IDB_STORE = "world";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB: ошибка запроса"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB: ошибка транзакции"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB: транзакция прервана"));
  });
}

function openIdb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB не открылась"));
    req.onblocked = () => reject(new Error("IndexedDB занята другой вкладкой"));
  });
}

export function idbWorldCache(name: string = IDB_NAME): WorldCache {
  let opened: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (!opened) {
      opened = openIdb(name).catch((e) => {
        opened = null;
        throw e;
      });
    }
    return opened;
  };
  return {
    async get(key) {
      try {
        const tx = (await db()).transaction(IDB_STORE, "readonly");
        const value: unknown = await request(tx.objectStore(IDB_STORE).get(key));
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        return null;
      } catch {
        return null;
      }
    },
    async put(key, bytes) {
      try {
        const tx = (await db()).transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        store.put(bytes, key);
        // Старые версии мира больше не нужны
        const keys = await request(store.getAllKeys());
        for (const k of keys) {
          if (typeof k === "string" && k.startsWith(WORLD_KEY_PREFIX) && k !== key) store.delete(k);
        }
        await done(tx);
      } catch {
        // Без кеша: при следующем запуске мир соберётся заново
      }
    },
  };
}

/** Несколько кешей: чтение — первый, где нашлось (с дозаписью в предыдущие), запись — во все */
export function layeredWorldCache(...caches: WorldCache[]): WorldCache {
  return {
    async get(key) {
      for (let i = 0; i < caches.length; i++) {
        const bytes = await caches[i].get(key);
        if (bytes) {
          for (let j = 0; j < i; j++) await caches[j].put(key, bytes);
          return bytes;
        }
      }
      return null;
    },
    async put(key, bytes) {
      for (const cache of caches) await cache.put(key, bytes);
    },
  };
}
