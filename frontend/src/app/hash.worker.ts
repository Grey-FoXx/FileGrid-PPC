/// <reference lib="webworker" />
import { createSHA256 } from "hash-wasm";
addEventListener("message", async ({ data }: MessageEvent<File>) => {
  try {
    const hash = await createSHA256();
    hash.init();
    for (let offset = 0; offset < data.size; offset += 8 * 1024 * 1024) {
      hash.update(
        new Uint8Array(
          await data.slice(offset, offset + 8 * 1024 * 1024).arrayBuffer(),
        ),
      );
      postMessage({
        progress: Math.min(
          100,
          Math.round(((offset + 8 * 1024 * 1024) / data.size) * 100),
        ),
      });
    }
    postMessage({ hash: hash.digest("hex") });
  } catch (error) {
    postMessage({ error: String(error) });
  }
});
