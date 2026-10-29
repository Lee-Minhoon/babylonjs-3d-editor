/*
 * 변경 알림용 리스너 모음. 도구 상태(subscribe/getX → useSyncExternalStore)에 쓰는 공통 부분.
 */

export type Listeners = {
  /** 등록하고, 해제 함수를 돌려준다 (useSyncExternalStore의 subscribe 형식) */
  subscribe(listener: () => void): () => void;
  emit(): void;
  clear(): void;
};

export function createListeners(): Listeners {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    emit: () => listeners.forEach((listener) => listener()),
    clear: () => listeners.clear(),
  };
}

/** 대상(키)별 리스너. 예: 메쉬마다 "이름이 바뀌었다"를 따로 알린다. 리스너가 없는 키는 들고 있지 않는다 */
export type KeyedListeners<K> = {
  subscribe(key: K, listener: () => void): () => void;
  emit(key: K): void;
};

export function createKeyedListeners<K>(): KeyedListeners<K> {
  const byKey = new Map<K, Set<() => void>>();
  return {
    subscribe(key, listener) {
      let listeners = byKey.get(key);
      if (!listeners) byKey.set(key, (listeners = new Set()));
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) byKey.delete(key);
      };
    },
    emit: (key) => byKey.get(key)?.forEach((listener) => listener()),
  };
}
