import { signal } from "@angular/core";
import { createSHA256 } from "hash-wasm";
import { Api, FileRecord } from "./api";

export const BUFFERED_DOWNLOAD_LIMIT = 128 * 1024 * 1024;
type Picker = (options: { suggestedName: string }) => Promise<{
  createWritable(): Promise<WritableStream<Uint8Array>>;
}>;
export class DownloadController {
  readonly state = signal<{ filename: string; received: number; total: number; label: string } | null>(null);
  readonly busy = signal(false);
  private controller: AbortController | null = null;
  constructor(private readonly api: Api) {}
  supportsStreaming() {
    return typeof (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker === "function";
  }
  allowed(file: FileRecord) {
    return this.supportsStreaming() || file.sizeBytes <= BUFFERED_DOWNLOAD_LIMIT;
  }
  cancel() {
    this.controller?.abort();
  }
  reset() {
    this.cancel();
    this.controller = null;
    this.state.set(null);
    this.busy.set(false);
  }
  async run(file: FileRecord): Promise<boolean> {
    if (this.busy()) return false;
    if (!this.allowed(file)) throw new Error("Descărcările peste 128 MiB necesită Chrome/Edge cu salvare streaming.");
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    this.busy.set(true);
    this.state.set({ filename: file.filename, received: 0, total: file.sizeBytes, label: "Pregătire descărcare…" });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
    try {
      const picker = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
      const handle = picker ? await picker.call(window, { suggestedName: file.filename }) : null;
      signal.throwIfAborted();
      const response = await this.api.downloadResponse(file.id, signal);
      const declaredHash = response.headers.get("X-Content-SHA256");
      if (declaredHash && declaredHash !== file.sha256) throw new Error("SHA-256 din răspuns diferă de metadatele fișierului.");
      if (!response.body) throw new Error("Răspunsul nu conține fișierul.");
      const hash = await createSHA256();
      signal.throwIfAborted();
      hash.init();
      if (handle) writer = (await handle.createWritable()).getWriter();
      signal.throwIfAborted();
      reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        received += value.byteLength;
        if (received > file.sizeBytes || (!handle && received > BUFFERED_DOWNLOAD_LIMIT))
          throw new Error("Dimensiunea descărcată depășește limita declarată.");
        hash.update(value);
        if (writer) await writer.write(value);
        else chunks.push(new Uint8Array(value));
        signal.throwIfAborted();
        this.state.set({ filename: file.filename, received, total: file.sizeBytes, label: "Se descarcă și se verifică SHA-256…" });
      }
      if (received !== file.sizeBytes) throw new Error("Descărcare incompletă: dimensiunea nu corespunde.");
      if (hash.digest("hex") !== file.sha256) throw new Error("SHA-256 descărcat nu corespunde!");
      signal.throwIfAborted();
      if (writer) {
        await writer.close();
        writer = undefined;
      } else {
        const url = URL.createObjectURL(new Blob(chunks, { type: file.contentType }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.filename;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      signal.throwIfAborted();
      this.state.set({ filename: file.filename, received, total: file.sizeBytes, label: "Descărcare verificată · SHA-256 identic" });
      return true;
    } catch (error) {
      if (writer) await writer.abort().catch(() => {});
      if (this.controller === controller && (signal.aborted || (error as Error).name === "AbortError")) {
        this.state.update(state => state && { ...state, label: "Descărcare anulată" });
        return false;
      }
      if (this.controller === controller) this.state.update(state => state && { ...state, label: "Descărcare nereușită" });
      throw error;
    } finally {
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      controller.abort();
      if (this.controller === controller) {
        this.controller = null;
        this.busy.set(false);
      }
    }
  }
}
