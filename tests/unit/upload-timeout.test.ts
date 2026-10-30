import { expect, it, vi } from "vitest";
import { readLimitedBody } from "@/server/http";
it("interrompe um upload que deixa de enviar dados", async () => {
  vi.useFakeTimers();
  try {
    const options = { method: "POST", body: new ReadableStream(), duplex: "half" };
    const pending = readLimitedBody(new Request("http://localhost/upload", options), 100);
    const check = expect(pending).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(30001); await check;
  } finally { vi.useRealTimers(); }
});
