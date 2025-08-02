/**
 * Audio context utility for handling user interaction requirements
 * Safely handles SSR and lazy browser-only initialization
 */

export type GetAudioContextOptions = AudioContextOptions & {
  id?: string;
};

const map: Map<string, AudioContext> = new Map();

const getUserInteraction = (): Promise<void> => {
  return new Promise((res) => {
    if (typeof window === "undefined") return; // SSR guard
    window.addEventListener("pointerdown", () => res(), { once: true });
    window.addEventListener("keydown", () => res(), { once: true });
  });
};

/**
 * Main audio context function 
 */
export const audioContext = async (
  options?: GetAudioContextOptions
): Promise<AudioContext> => {
  if (typeof window === "undefined") {
    throw new Error("audioContext can only be used in the browser.");
  }

  try {
    const testAudio = new Audio();
    testAudio.src =
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    await testAudio.play(); // Autoplay policy test
  } catch {
    await getUserInteraction(); // Wait for click/keypress if autoplay blocked
  }

  if (options?.id && map.has(options.id)) {
    return map.get(options.id)!;
  }

  const ctx = new AudioContext(options);
  if (options?.id) {
    map.set(options.id, ctx);
  }
  return ctx;
};

/**
 * Converts base64-encoded audio to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}