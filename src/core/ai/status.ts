import type { ResolvedAiProvider } from "./provider-selection.js";
import type { StatusCallback } from "./contracts.js";

export function startLiveStatus(provider: ResolvedAiProvider, onStatus?: StatusCallback): () => void {
  if (!onStatus) return () => {};

  const cycle = [
    `Checking availability of ${provider} CLI session...`,
    `${provider} is generating and applying the requested changes...`,
    `${provider} is waiting for additional response while edits are in progress...`
  ];

  const startedAt = Date.now();
  let index = 0;
  const timer = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    onStatus(`${cycle[index % cycle.length]} (${elapsedSeconds}s)`);
    index += 1;
  }, 1400);

  return () => clearInterval(timer);
}
