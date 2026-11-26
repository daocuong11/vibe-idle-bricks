import { useEffect } from 'react';
import { getAudioModule } from '../utils/audio';

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/** Create the AudioContext from the first user gesture, then stop listening. */
export function useAudioUnlock(): void {
  useEffect(() => {
    const audio = getAudioModule();
    const removeListeners = () => {
      GESTURE_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleGesture, true);
      });
    };
    const handleGesture = () => {
      removeListeners();
      audio.unlock();
    };

    GESTURE_EVENTS.forEach((event) => {
      window.addEventListener(event, handleGesture, { capture: true, once: true });
    });

    return removeListeners;
  }, []);
}
