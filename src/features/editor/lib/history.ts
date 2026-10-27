/**
 * Undo/Redo 히스토리 (Command 패턴).
 * 씬을 바꾸는 모든 동작은 Command로 만들어 history.execute()로 실행한다.
 */
export type Command = {
  /** UI 표시용 (예: "Box 3 추가"). execute 이후에 확정되어도 된다. */
  readonly label: string;
  execute(): void;
  undo(): void;
  /**
   * 히스토리에서 영구히 빠질 때 호출 (redo 스택 폐기, 최대 개수 초과, 히스토리 정리).
   * 떼어둔(detach) 리소스를 실제로 해제하는 곳.
   */
  dispose?(): void;
};

export type HistoryState = {
  undoLabel: string | null;
  redoLabel: string | null;
};

export type History = {
  execute(command: Command): void;
  undo(): void;
  redo(): void;
  getState(): HistoryState;
  /**
   * 가장 최근에 실행된(undo 스택 맨 위) Command. 저장 시점과 비교해 변경 여부를 판단한다.
   * undo로 저장 시점까지 되돌아가면 다시 같은 Command가 된다.
   */
  peek(): Command | null;
  subscribe(onChange: () => void): () => void;
  /** 모든 기록을 버린다 (새 씬·열기). 구독은 유지된다. */
  clear(): void;
  /** 모든 기록을 버리고 Command들을 dispose 한다. */
  dispose(): void;
};

const DEFAULT_LIMIT = 100;

export function createHistory({ limit = DEFAULT_LIMIT } = {}): History {
  const undoStack: Command[] = [];
  const redoStack: Command[] = [];
  const listeners = new Set<() => void>();

  // useSyncExternalStore용으로 변경 시에만 새 객체를 만든다
  let state: HistoryState = { undoLabel: null, redoLabel: null };
  const emit = () => {
    state = {
      undoLabel: undoStack.at(-1)?.label ?? null,
      redoLabel: redoStack.at(-1)?.label ?? null,
    };
    listeners.forEach((listener) => listener());
  };

  const disposeAll = (commands: Command[]) => {
    for (const command of commands.splice(0)) command.dispose?.();
  };

  const clear = () => {
    disposeAll(undoStack);
    disposeAll(redoStack);
    emit();
  };

  return {
    execute(command) {
      command.execute();
      undoStack.push(command);
      disposeAll(redoStack);
      if (undoStack.length > limit) undoStack.shift()?.dispose?.();
      emit();
    },
    undo() {
      const command = undoStack.pop();
      if (!command) return;
      command.undo();
      redoStack.push(command);
      emit();
    },
    redo() {
      const command = redoStack.pop();
      if (!command) return;
      command.execute();
      undoStack.push(command);
      emit();
    },
    getState: () => state,
    peek: () => undoStack.at(-1) ?? null,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    clear,
    dispose() {
      clear();
      listeners.clear();
    },
  };
}
