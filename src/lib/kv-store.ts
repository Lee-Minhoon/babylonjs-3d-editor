/*
 * IndexedDB 키-값 저장소 (브라우저 전용). 값은 구조화 복제 가능한 것이면 된다.
 * 데이터는 이 브라우저·이 사이트에만 남는다 (기기 간 동기화 없음, 사이트 데이터를 지우면 사라짐).
 */

export type KeyValueStore = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

const STORE = "kv";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createKeyValueStore(dbName: string): KeyValueStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => {
    db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        db = null; // 다음 호출에서 다시 시도
        reject(req.error);
      };
    });
    return db;
  };

  const store = async (mode: IDBTransactionMode) =>
    (await open()).transaction(STORE, mode).objectStore(STORE);

  /** 쓰기는 요청 성공이 아니라 트랜잭션이 커밋돼야 끝난 것 (직후에 탭이 닫혀도 남도록) */
  const write = async (run: (target: IDBObjectStore) => IDBRequest) => {
    const target = await store("readwrite");
    run(target);
    await new Promise<void>((resolve, reject) => {
      target.transaction.oncomplete = () => resolve();
      target.transaction.onerror = () => reject(target.transaction.error);
      target.transaction.onabort = () => reject(target.transaction.error);
    });
  };

  return {
    get: async <T>(key: string) =>
      (await request((await store("readonly")).get(key))) as T | undefined,
    set: (key, value) => write((target) => target.put(value, key)),
    delete: (key) => write((target) => target.delete(key)),
  };
}
