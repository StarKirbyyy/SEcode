import { createTerminalError, type TerminalLayerError } from "./errors";
import { terminalSafeText } from "./text-safety";
import type { TerminalFrame, TerminalIO, TerminalWriter } from "./types";

export class SerializedTerminalWriter implements TerminalWriter {
  private tail: Promise<void> = Promise.resolve();
  private failure?: TerminalLayerError;

  constructor(private readonly io: Pick<TerminalIO, "write">) {}

  get failed(): boolean {
    return this.failure !== undefined;
  }

  write(frame: TerminalFrame): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    const safe: TerminalFrame = { ...frame, text: terminalSafeText(frame.text) };
    const operation = this.tail.then(async () => {
      if (this.failure) throw this.failure;
      try {
        await this.io.write(safe);
      } catch (cause) {
        this.failure = createTerminalError("TERMINAL_IO_ERROR", "终端输出失败", undefined, cause);
        throw this.failure;
      }
    });
    this.tail = operation.catch(() => undefined);
    return operation;
  }

  async flush(): Promise<void> {
    await this.tail;
    if (this.failure) throw this.failure;
  }
}

export function createTerminalWriter(io: Pick<TerminalIO, "write">): TerminalWriter {
  return new SerializedTerminalWriter(io);
}
