import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { addPresetMesh, findPreset } from "./mesh-presets";
import {
  createPerformanceMonitor,
  PERFORMANCE_SAMPLE_INTERVAL,
} from "./performance-monitor";
import { clearEditorMeshes } from "./scene-format";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  clearEditorMeshes(scene);
});

describe("성능 표시", () => {
  test("켜져 있을 때만 0.5초마다 재고, 끄면 멈춘다", () => {
    const monitor = createPerformanceMonitor(scene);
    const listener = vi.fn();
    monitor.subscribe(listener);
    addPresetMesh(scene, findPreset("box")!);
    addPresetMesh(scene, findPreset("sphere")!);

    vi.advanceTimersByTime(PERFORMANCE_SAMPLE_INTERVAL * 3);
    expect(listener).not.toHaveBeenCalled();

    monitor.setVisible(true);
    expect(monitor.getState()).toEqual({ visible: true, stats: null });
    vi.advanceTimersByTime(PERFORMANCE_SAMPLE_INTERVAL);
    expect(monitor.getState().stats).toMatchObject({ objects: 2 });

    monitor.setVisible(false);
    const calls = listener.mock.calls.length;
    vi.advanceTimersByTime(PERFORMANCE_SAMPLE_INTERVAL * 3);
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(monitor.getState()).toEqual({ visible: false, stats: null });
    monitor.dispose();
  });
});
