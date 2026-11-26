import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderHook } from '@testing-library/react';
import { useAudioUnlock } from '../../src/hooks/useAudioUnlock';
import { getAudioModule } from '../../src/utils/audio';

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

describe('useAudioUnlock', () => {
  beforeEach(() => {
    vi.spyOn(getAudioModule(), 'unlock').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs one capture/once listener per gesture without re-binding on rerender', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(() => useAudioUnlock());

    rerender();

    expect(add).toHaveBeenCalledTimes(GESTURE_EVENTS.length);
    GESTURE_EVENTS.forEach((event, index) => {
      expect(add).toHaveBeenNthCalledWith(index + 1, event, expect.any(Function), {
        capture: true,
        once: true,
      });
    });
    expect(remove).not.toHaveBeenCalled();
    expect(getAudioModule().unlock).not.toHaveBeenCalled();
  });

  it.each(GESTURE_EVENTS)('unlocks on the first %s and removes every listener', (event) => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useAudioUnlock());

    if (event === 'pointerdown') fireEvent.pointerDown(document.body);
    if (event === 'keydown') fireEvent.keyDown(document.body, { key: ' ' });
    if (event === 'touchstart') fireEvent.touchStart(document.body);

    expect(getAudioModule().unlock).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(GESTURE_EVENTS.length);
    GESTURE_EVENTS.forEach((name, index) => {
      expect(remove).toHaveBeenNthCalledWith(index + 1, name, add.mock.calls[index][1], true);
    });

    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'p' });
    fireEvent.touchStart(document.body);
    expect(getAudioModule().unlock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('removes pending listeners on unmount without unlocking', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useAudioUnlock());

    unmount();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'p' });
    fireEvent.touchStart(document.body);

    expect(remove).toHaveBeenCalledTimes(GESTURE_EVENTS.length);
    GESTURE_EVENTS.forEach((event, index) => {
      expect(remove).toHaveBeenNthCalledWith(index + 1, event, add.mock.calls[index][1], true);
    });
    expect(getAudioModule().unlock).not.toHaveBeenCalled();
  });
});
