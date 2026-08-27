export function streamFromBytes(
  bytes: Uint8Array,
  boundaries: number[] = [],
): ReadableStream<Uint8Array> {
  const points = [0, ...boundaries, bytes.byteLength]
    .filter((value, index, values) =>
      value >= 0 &&
      value <= bytes.byteLength &&
      (index === 0 || value !== values[index - 1]),
    )
    .sort((left, right) => left - right);
  const chunks: Uint8Array[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const chunk = bytes.slice(points[index], points[index + 1]);
    if (chunk.byteLength > 0) {
      chunks.push(chunk);
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

export function streamFromText(
  text: string,
  boundaries: number[] = [],
): ReadableStream<Uint8Array> {
  return streamFromBytes(new TextEncoder().encode(text), boundaries);
}

export function sseResponse(
  data: Array<Record<string, unknown> | "[DONE]">,
  init: ResponseInit = {},
): Response {
  const text = data
    .map((item) =>
      item === "[DONE]"
        ? "data: [DONE]\n\n"
        : `data: ${JSON.stringify(item)}\n\n`,
    )
    .join("");
  return new Response(streamFromText(text), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
    ...init,
  });
}

export async function collectAsync<T>(
  iterable: AsyncIterable<T>,
): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}
