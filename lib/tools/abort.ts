import { LocalToolExecutionAbortedError } from "./types";

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new LocalToolExecutionAbortedError(signal.reason);
  }
}

export function listenForAbort(
  signal: AbortSignal,
  listener: () => void,
): () => void {
  if (signal.aborted) {
    listener();
    return () => undefined;
  }
  signal.addEventListener("abort", listener, { once: true });
  return () => signal.removeEventListener("abort", listener);
}
