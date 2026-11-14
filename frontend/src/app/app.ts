import { Component, OnDestroy, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { createSHA256 } from "hash-wasm";
import { Api, ApiError, FileRecord, Session, Incident, Reading, Page } from "./api";
interface Business {
  files: number;
  readings: number;
  incidents: number;
  mode: string;
  recentIncidents: number;
  zones: { zone: string; incidents: number }[];
}
interface Series {
  category: string;
  storage: string;
  operation: string;
  operations: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  bytesPerSecond: number;
  operationsPerSecond: number;
  errorRate: number;
}
interface SavedUpload {
  username: string;
  hash: string;
  category: string;
  sessionId: string;
  filename: string;
  contextKey: string;
}
@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.html",
})
export class AppComponent implements OnDestroy {
  api = new Api(() => {
    if (!this.me()) return;
    this.logout();
    this.error.set("Autentificarea nu mai este validă. Autentifică-te din nou.");
  });
  me = signal<{ username: string; role: string } | null>(null);
  tab = signal("dashboard");
  busy = signal(false);
  loading = signal(false);
  online = signal(true);
  private authGeneration = 0;
  private refreshController: AbortController | null = null;
  error = signal("");
  notice = signal("");
  username = "admin";
  password = "";
  files = signal<FileRecord[]>([]);
  incidents = signal<Incident[]>([]);
  readings = signal<Reading[]>([]);
  business = signal<Business | null>(null);
  series = signal<Series[]>([]);
  policies = signal<unknown>(null);
  search = "";
  categoryFilter = "";
  filePage = signal(0);
  fileTotal = signal(0);
  selectedFile = signal<FileRecord | null>(null);
  category = "INCIDENT";
  attachmentType = "BINARY";
  sensitivity = "SENSITIVE";
  incidentId = "";
  applicationId = "DEMO-001";
  documentType = "APPLICATION";
  file: File | null = null;
  stationId = "ST-1001";
  zone = "Dobrogea";
  eventType = "VOLTAGE_DROP";
  severity = 3;
  affectedCustomers = 120;
  latitude = 44.18;
  longitude = 28.65;
  safetyCritical = false;
  progress = signal(0);
  uploadLabel = signal("");
  activeSession = signal<Session | null>(null);
  paused = signal(false);
  checksum = signal("");
  private controller: AbortController | null = null;
  private timer = window.setInterval(() => {
    if (this.me() && !this.loading()) void this.refresh(true);
  }, 5000);
  tabs = [
    ["dashboard", "▦", "Privire de ansamblu"],
    ["upload", "↑", "Încarcă fișiere"],
    ["files", "▤", "Fișiere"],
    ["incidents", "ϟ", "Dispecerat"],
    ["meters", "⌁", "Citiri contoare"],
    ["policies", "⇄", "Politici de stocare"],
  ];
  labels: Record<string, string> = {
    METER_READING: "Citiri contoare",
    INCIDENT: "Avarii",
    CONNECTION_DOCUMENT: "Racordare",
    DRONE_VIDEO: "Inspecții dronă",
  };
  ngOnDestroy() {
    clearInterval(this.timer);
    this.controller?.abort();
    this.refreshController?.abort();
    this.api.clear();
  }
  canStats() {
    return ["ADMIN", "DISPATCHER"].includes(this.me()?.role || "");
  }
  canIncidents() {
    return ["ADMIN", "DISPATCHER", "FIELD_OPERATOR"].includes(
      this.me()?.role || "",
    );
  }
  canDocuments() {
    return ["ADMIN", "CONNECTION_AGENT"].includes(this.me()?.role || "");
  }
  async login() {
    if (this.busy()) return;
    const generation = ++this.authGeneration;
    this.busy.set(true);
    this.error.set("");
    try {
      this.api.setCredentials(this.username, this.password);
      const me = await this.api.request<{ username: string; role: string }>("/me");
      if (generation !== this.authGeneration) return;
      this.me.set(me);
      this.password = "";
      this.category = me.role === "CONNECTION_AGENT" ? "CONNECTION_DOCUMENT" : "INCIDENT";
      this.tab.set(this.canStats() ? "dashboard" : "files");
      await this.refresh();
    } catch (e) {
      if (generation !== this.authGeneration) return;
      this.me.set(null);
      this.api.clear();
      this.fail(e);
    } finally {
      if (generation === this.authGeneration) this.busy.set(false);
    }
  }
  logout() {
    this.authGeneration++;
    this.paused.set(true);
    this.controller?.abort();
    this.refreshController?.abort();
    this.api.clear();
    this.me.set(null);
    this.password = "";
    this.busy.set(false);
    this.loading.set(false);
    this.online.set(true);
    this.files.set([]);
    this.fileTotal.set(0);
    this.filePage.set(0);
    this.search = "";
    this.categoryFilter = "";
    this.incidents.set([]);
    this.readings.set([]);
    this.business.set(null);
    this.series.set([]);
    this.policies.set(null);
    this.selectedFile.set(null);
    this.activeSession.set(null);
    this.file = null;
    this.incidentId = "";
    this.checksum.set("");
    this.progress.set(0);
    this.uploadLabel.set("");
    this.notice.set("");
    this.error.set("");
  }
  async go(tab: string) {
    this.tab.set(tab);
    window.scrollTo({ top: 0 });
    this.error.set("");
    await this.refresh();
  }
  async refresh(_silent = false) {
    if (!this.me()) return;
    this.refreshController?.abort();
    const controller = new AbortController();
    this.refreshController = controller;
    this.loading.set(true);
    const generation = this.authGeneration;
    const current = () => generation === this.authGeneration && !controller.signal.aborted;
    const errors: string[] = [];
    let networkFailure = false;
    const load = async <T>(path: string, apply: (value: T) => void) => {
      try {
        const value = await this.api.request<T>(path, { signal: controller.signal });
        if (current()) apply(value);
      } catch (e) {
        if (!current()) return;
        const problem = e as ApiError;
        if (problem.status === undefined) networkFailure = true;
        errors.push(this.problemMessage(e));
      }
    };
    const q = new URLSearchParams({
      page: String(this.filePage()), size: "25", search: this.search, category: this.categoryFilter,
    });
    const requests: Promise<void>[] = [
      load<Page<FileRecord>>("/files?" + q, f => {
        this.files.set(f.items);
        this.fileTotal.set(f.total);
      }),
    ];
    if (this.canStats()) {
      requests.push(
        load<Business>("/stats/business", b => this.business.set(b)),
        load<Page<Incident>>("/incidents", i => this.incidents.set(i.items)),
        load<Page<Reading>>("/meter-readings", m => this.readings.set(m.items)),
        load<{ series: Series[] }>("/stats/technical", t => this.series.set(t.series)),
      );
    } else if (this.me()?.role === "FIELD_OPERATOR") {
      requests.push(load<Page<Incident>>("/incidents", i => this.incidents.set(i.items)));
    }
    if (this.tab() === "policies")
      requests.push(load<unknown>("/policies", p => this.policies.set(p)));
    await Promise.all(requests);
    if (!current()) return;
    this.online.set(!networkFailure);
    if (errors.length) this.error.set([...new Set(errors)].join(" · "));
    this.loading.set(false);
  }
  async filter() {
    this.filePage.set(0);
    await this.refresh();
  }
  async nextPage(delta: number) {
    this.filePage.update((x) => Math.max(0, x + delta));
    await this.refresh();
  }
  selectFile(event: Event) {
    this.file = (event.target as HTMLInputElement).files?.[0] || null;
    this.checksum.set("");
    this.progress.set(0);
    this.uploadLabel.set("");
    this.activeSession.set(null);
  }
  async createIncident() {
    const generation = this.authGeneration;
    this.error.set("");
    this.busy.set(true);
    try {
      const result = await this.api.request<Incident>("/incidents", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          stationId: this.stationId,
          zone: this.zone,
          eventType: this.eventType,
          severity: this.severity,
          affectedCustomers: this.affectedCustomers,
          latitude: this.latitude,
          longitude: this.longitude,
          safetyCritical: this.safetyCritical,
        }),
      });
      if (generation !== this.authGeneration) return;
      this.incidentId = result.id;
      this.notice.set(
        "Incident creat. Metadatele sunt disponibile; poți adăuga atașamentul.",
      );
      await this.refresh();
    } catch (e) {
      if (generation === this.authGeneration) this.fail(e);
    } finally {
      if (generation === this.authGeneration) this.busy.set(false);
    }
  }
  hashFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./hash.worker", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }) => {
        if (data.progress !== undefined)
          this.uploadLabel.set("Calcul SHA-256 · " + data.progress + "%");
        if (data.hash) {
          worker.terminate();
          resolve(data.hash);
        }
        if (data.error) {
          worker.terminate();
          reject(new Error(data.error));
        }
      };
      worker.onerror = () => {
        worker.terminate();
        reject(new Error("Calculul checksum a eșuat"));
      };
      worker.postMessage(file);
    });
  }
  saved(): SavedUpload[] {
    try {
      return JSON.parse(localStorage.getItem("filegrid.uploads") || "[]");
    } catch {
      return [];
    }
  }
  saveUpload(value: SavedUpload) {
    localStorage.setItem(
      "filegrid.uploads",
      JSON.stringify(
        [
          ...this.saved().filter((x) => x.sessionId !== value.sessionId),
          value,
        ].slice(-20),
      ),
    );
  }
  async retry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        if (this.paused()) throw new DOMException("Paused", "AbortError");
        return await run();
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (
          this.paused() ||
          attempt >= 4 ||
          (status !== undefined && ![429, 502, 503, 504].includes(status))
        )
          throw e;
        this.uploadLabel.set(
          "Conexiune întreruptă · reîncercare " + (attempt + 1),
        );
        await new Promise((r) =>
          setTimeout(
            r,
            Math.min(8000, 500 * 2 ** attempt) + Math.random() * 200,
          ),
        );
      }
    }
  }
  pause() {
    this.paused.set(true);
    this.controller?.abort();
    this.uploadLabel.set(
      "Transfer pus în pauză. Selectează același fișier pentru reluare.",
    );
  }
  async upload() {
    if (!this.file) return;
    const file = this.file;
    const category = this.category;
    this.error.set("");
    this.notice.set("");
    this.busy.set(true);
    this.paused.set(false);
    this.progress.set(0);
    this.controller = new AbortController();
    try {
      const hash = await this.hashFile(file);
      this.checksum.set(hash);
      if (this.paused()) throw new DOMException("Paused", "AbortError");
      const contextKey = JSON.stringify({
        incidentId: category === "INCIDENT" ? this.incidentId : "",
        applicationId:
          category === "CONNECTION_DOCUMENT" ? this.applicationId : "",
        documentType: this.documentType,
        attachmentType: this.attachmentType,
        sensitivity: this.sensitivity,
      });
      const previous = this.saved().find(
        (x) =>
          x.hash === hash &&
          x.category === category &&
          x.username === this.me()?.username &&
          x.contextKey === contextKey,
      );
      let session: Session;
      if (previous) {
        session = await this.api.request<Session>(
          "/upload-sessions/" + previous.sessionId,
        );
        if (session.status === "CANCELLED")
          throw new Error(
            "Sesiunea veche a fost anulată. Elimină sesiunile locale pentru un upload nou.",
          );
      } else {
        const key = crypto.randomUUID();
        session = await this.retry(() =>
          this.api.request<Session>("/upload-sessions", {
            method: "POST",
            signal: this.controller!.signal,
            headers: { "Idempotency-Key": key },
            body: JSON.stringify({
              category,
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              sha256: hash,
              incidentId: category === "INCIDENT" ? this.incidentId : undefined,
              applicationId:
                category === "CONNECTION_DOCUMENT"
                  ? this.applicationId
                  : undefined,
              documentType: this.documentType,
              attachmentType: this.attachmentType,
              sensitivity:
                category === "CONNECTION_DOCUMENT"
                  ? "SENSITIVE"
                  : this.sensitivity,
            }),
          }),
        );
        this.saveUpload({
          username: this.me()!.username,
          hash,
          category,
          sessionId: session.sessionId,
          filename: file.name,
          contextKey,
        });
      }
      this.activeSession.set(session);
      if (!["AVAILABLE", "VERIFYING"].includes(session.status)) {
        if (session.uploadMode === "SINGLE") {
          this.uploadLabel.set("Se transferă fișierul…");
          if (session.status !== "UPLOADED")
            await this.retry(() =>
              this.api.request(
                "/upload-sessions/" + session.sessionId + "/content",
                { method: "PUT", signal: this.controller!.signal, body: file },
              ),
            );
          this.progress.set(100);
        } else {
          const done = new Set(session.confirmedParts.map((x) => x.number));
          const count = Math.ceil(file.size / session.partSizeBytes);
          for (let n = 1; n <= count; n++) {
            if (!done.has(n)) {
              const part = file.slice(
                (n - 1) * session.partSizeBytes,
                Math.min(n * session.partSizeBytes, file.size),
              );
              const h = await createSHA256();
              h.init();
              h.update(new Uint8Array(await part.arrayBuffer()));
              const partHash = h.digest("hex");
              this.uploadLabel.set("Transfer parte " + n + " / " + count);
              await this.retry(() =>
                this.api.request(
                  "/upload-sessions/" + session.sessionId + "/parts/" + n,
                  {
                    method: "PUT",
                    signal: this.controller!.signal,
                    headers: { "X-Part-SHA256": partHash },
                    body: part,
                  },
                ),
              );
            }
            this.progress.set(Math.round((n / count) * 100));
          }
        }
        await this.retry(() =>
          this.api.request(
            "/upload-sessions/" + session.sessionId + "/complete",
            { method: "POST", signal: this.controller!.signal },
          ),
        );
      }
      this.uploadLabel.set("Transfer încheiat · verificare în storage");
      for (let n = 0; n < 120; n++) {
        const result = await this.api.request<FileRecord>(
          "/files/" + session.fileId,
        );
        if (result.status === "AVAILABLE") {
          this.notice.set(
            "Fișier disponibil · SHA-256 verificat · " + result.storage,
          );
          this.uploadLabel.set("Integritate confirmată");
          await this.refresh();
          return;
        }
        if (["FAILED", "CORRUPTED", "CANCELLED"].includes(result.status))
          throw new Error("Verificarea fișierului a eșuat: " + result.status);
        await new Promise((r) => setTimeout(r, 1000));
      }
      this.notice.set(
        "Verificarea continuă în fundal. Urmărește starea în Fișiere.",
      );
    } catch (e) {
      if (this.paused())
        this.notice.set("Sesiunea este păstrată. Reia cu același fișier.");
      else this.fail(e);
    } finally {
      this.busy.set(false);
      this.controller = null;
    }
  }
  clearSessions() {
    localStorage.removeItem("filegrid.uploads");
    this.notice.set(
      "Referințele locale au fost șterse. Sesiunile serverului expiră după 24h.",
    );
  }
  async download(file: FileRecord) {
    const generation = this.authGeneration;
    this.error.set("");
    this.notice.set("");
    try {
      const picker = (
        window as unknown as {
          showSaveFilePicker?: (options: unknown) => Promise<{
            createWritable(): Promise<WritableStream<Uint8Array>>;
          }>;
        }
      ).showSaveFilePicker;
      const handle = picker
        ? await picker.call(window, { suggestedName: file.filename })
        : null;
      if (!handle && file.sizeBytes > 128 * 1024 * 1024)
        throw new Error(
          "Pentru descărcare streaming peste 128 MiB folosește Chrome/Edge cu File System Access.",
        );
      if (generation !== this.authGeneration) return;
      const response = await this.api.downloadResponse(file.id);
      const hash = await createSHA256();
      hash.init();
      if (handle) {
        const writable = await handle.createWritable();
        const reader = response.body!.getReader();
        const writer = writable.getWriter();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            hash.update(value);
            await writer.write(value);
          }
          if (hash.digest("hex") !== file.sha256)
            throw new Error("SHA-256 descărcat nu corespunde!");
          if (generation !== this.authGeneration) throw new DOMException("Logged out", "AbortError");
          await writer.close();
        } catch (e) {
          await writer.abort();
          throw e;
        }
      } else {
        const blob = await response.blob();
        hash.update(new Uint8Array(await blob.arrayBuffer()));
        if (hash.digest("hex") !== file.sha256)
          throw new Error("SHA-256 descărcat nu corespunde!");
        if (generation !== this.authGeneration) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      if (generation !== this.authGeneration) return;
      this.notice.set(
        "Descărcare verificată: SHA-256 original = SHA-256 recuperat.",
      );
    } catch (e) {
      if (generation === this.authGeneration) this.fail(e);
    }
  }
  async downloadReading(row: Reading) {
    const generation = this.authGeneration;
    try {
      const file = await this.api.request<FileRecord>("/files/" + row.fileId);
      if (generation === this.authGeneration) await this.download(file);
    } catch (e) {
      if (generation === this.authGeneration) this.fail(e);
    }
  }
  attachTo(incident: Incident) {
    this.incidentId = incident.id;
    this.category = "INCIDENT";
    this.tab.set("upload");
  }
  bytes(n: number) {
    if (n < 1024) return n + " B";
    if (n < 1024 ** 2) return (n / 1024).toFixed(1) + " KiB";
    if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + " MiB";
    return (n / 1024 ** 3).toFixed(2) + " GiB";
  }
  private problemMessage(e: unknown) {
    const x = e as ApiError;
    const message = x.status === 403
      ? "Nu ai permisiunea pentru această operație. " + x.message
      : x.message || String(e);
    return message + (x.correlationId ? " · ID " + x.correlationId : "");
  }
  fail(e: unknown) {
    if ((e as Error).name !== "AbortError") this.error.set(this.problemMessage(e));
  }
}
