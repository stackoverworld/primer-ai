import type { ResolvedAiProvider } from "./provider-selection.js";
import type { StatusCallback } from "./contracts.js";

export function startLiveStatus(provider: ResolvedAiProvider, onStatus?: StatusCallback): () => void {
  if (!onStatus) return () => {};

  const startedAt = Date.now();
  const HEARTBEAT_MS = 8_000;
  const timer = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    onStatus(`${provider} is still processing the request... (${elapsedSeconds}s)`);
  }, HEARTBEAT_MS);

  return () => clearInterval(timer);
}
