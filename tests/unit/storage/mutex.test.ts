import { describe, expect, it } from "vitest";

import { KeyedFifoExecutor } from "@/lib/storage/mutex";

describe("KeyedFifoExecutor", () => {
  it("runs the same key in strict FIFO order", async () => {
    const executor = new KeyedFifoExecutor();
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3].map((value) =>
        executor.run("session", async () => {
          order.push(value);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3]);
    expect(executor.sizeForTesting()).toBe(0);
  });

  it("continues after a rejected task", async () => {
    const executor = new KeyedFifoExecutor();
    const first = executor.run("session", async () => {
      throw new Error("first failed");
    });
    const second = executor.run("session", async () => "continued");
    await expect(first).rejects.toThrow("first failed");
    await expect(second).resolves.toBe("continued");
  });

  it("does not block a different key", async () => {
    const executor = new KeyedFifoExecutor();
    let release: (() => void) | undefined;
    const blocked = executor.run(
      "one",
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    await expect(executor.run("two", async () => "free")).resolves.toBe(
      "free",
    );
    release?.();
    await blocked;
  });
});
