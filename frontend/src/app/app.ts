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
  sessionId?: string;
  idempotencyKey?: string;
  filename: string;
  sizeBytes?: number;
  contentType?: string;
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
  cancelling = signal(false);
  requestedResume = signal<SavedUpload | null>(null);
  uploadPhase = signal("idle");
  recovery = signal<{ upload: SavedUpload; reason: string } | null>(null);
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
    this.cancelling.set(false);
    this.requestedResume.set(null);
    this.uploadPhase.set("idle");
    this.recovery.set(null);
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
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] || null;
    input.value = "";
    this.checksum.set("");
    this.progress.set(0);
    this.uploadLabel.set("");
    this.activeSession.set(null);
    this.recovery.set(null);
    this.uploadPhase.set("idle");
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
  hashFile(file: File, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const worker = new Worker(new URL("./hash.worker", import.meta.url), {
        type: "module",
      });
      const cleanup = () => {
        signal.removeEventListener("abort", abort);
        worker.terminate();
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Transfer oprit", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }) => {
        if (signal.aborted) return;
        if (data.progress !== undefined)
          this.uploadLabel.set("Calcul SHA-256 · " + data.progress + "%");
        if (data.hash) {
          cleanup();
          resolve(data.hash);
        } else if (data.error) {
          cleanup();
          reject(new Error(data.error));
        }
      };
      worker.onerror = () => {
        cleanup();
        reject(new Error("Calculul checksum a eșuat"));
      };
      worker.postMessage(file);
    });
  }
  saved(): SavedUpload[] {
    try {
      const values: unknown = JSON.parse(localStorage.getItem("filegrid.uploads") || "[]");
      return Array.isArray(values) ? values.filter((x): x is SavedUpload =>
        x && typeof x.username === "string" && typeof x.hash === "string" &&
        typeof x.category === "string" && typeof x.filename === "string" &&
        typeof x.contextKey === "string" &&
        (typeof x.sessionId === "string" || typeof x.idempotencyKey === "string"),
      ) : [];
    } catch {
      return [];
    }
  }
  savedForCurrentUser() {
    return this.saved().filter(x => x.username === this.me()?.username);
  }
  hasIncident(id: string) {
    return this.incidents().some(x => x.id === id);
  }
  restoreUpload(upload: SavedUpload) {
    if (this.busy() || upload.username !== this.me()?.username) return;
    try {
      if (upload.category === "CONNECTION_DOCUMENT" ? !this.canDocuments() : !this.canIncidents())
        throw new Error("Rolul curent nu permite reluarea acestei categorii.");
      const context = JSON.parse(upload.contextKey);
      for (const key of ["incidentId", "applicationId", "documentType", "attachmentType", "sensitivity"])
        if (typeof context[key] !== "string") throw new Error("Contextul sesiunii locale este invalid.");
      if (!["CONNECTION_DOCUMENT", "INCIDENT", "DRONE_VIDEO"].includes(upload.category))
        throw new Error("Categoria sesiunii locale este invalidă.");
      // Normalize legacy document references: the API always received SENSITIVE.
      if (upload.category === "CONNECTION_DOCUMENT") context.sensitivity = "SENSITIVE";
      const restored = { ...upload, contextKey: JSON.stringify({
        incidentId: context.incidentId, applicationId: context.applicationId,
        documentType: context.documentType, attachmentType: context.attachmentType,
        sensitivity: context.sensitivity,
      }) };
      this.saveUpload(restored);
      this.category = upload.category;
      this.incidentId = context.incidentId;
      this.applicationId = context.applicationId;
      this.documentType = context.documentType;
      this.attachmentType = context.attachmentType;
      this.sensitivity = context.sensitivity;
      this.file = null;
      this.activeSession.set(null);
      this.recovery.set(null);
      this.requestedResume.set(restored);
      this.checksum.set("");
      this.progress.set(0);
      this.uploadLabel.set("Context restaurat. Selectează fișierul original pentru reluare.");
      this.error.set("");
      this.notice.set("");
    } catch (e) {
      this.fail(e);
    }
  }
  leaveResume() {
    if (this.busy()) return;
    this.requestedResume.set(null);
    this.recovery.set(null);
    this.activeSession.set(null);
    this.file = null;
    this.checksum.set("");
    this.progress.set(0);
    this.uploadLabel.set("");
  }
  private sameUpload(a: SavedUpload, b: SavedUpload) {
    return a.username === b.username && (
      a.idempotencyKey && b.idempotencyKey
        ? a.idempotencyKey === b.idempotencyKey
        : !!a.sessionId && a.sessionId === b.sessionId
    );
  }
  saveUpload(value: SavedUpload) {
    // Persist before POST: a lost creation response can be replayed with the same key.
    const remaining = this.saved().filter(x => !this.sameUpload(x, value));
    if (remaining.filter(x => x.username === value.username).length >= 100)
      throw new Error("Ai 100 de sesiuni locale. Reia sau anulează transferurile; poți elimina explicit referințele locale ale contului.");
    localStorage.setItem("filegrid.uploads", JSON.stringify([...remaining, value]));
  }
  private forgetUpload(value: SavedUpload) {
    localStorage.setItem("filegrid.uploads", JSON.stringify(
      this.saved().filter(x => !this.sameUpload(x, value)),
    ));
  }
  private wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Transfer oprit", "AbortError"));
      };
      const timer = window.setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, ms);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  async retry<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try {
        const value = await run();
        signal.throwIfAborted();
        return value;
      } catch (e) {
        signal.throwIfAborted();
        const problem = e as ApiError;
        if (problem.name === "AbortError" || attempt >= 4 ||
            (problem.status !== undefined && ![429, 502, 503, 504].includes(problem.status)) ||
            (problem.status === undefined && !(e instanceof TypeError))) throw e;
        this.uploadLabel.set("Conexiune întreruptă · reîncercare " + (attempt + 1));
        await this.wait(Math.min(8000, 500 * 2 ** attempt) + Math.random() * 200, signal);
      }
    }
  }
  pause() {
    if (!this.controller || this.cancelling()) return;
    this.paused.set(true);
    this.controller.abort();
    this.uploadPhase.set("paused");
    this.uploadLabel.set("Transfer pus în pauză. Reia cu același fișier.");
  }
  private recover(upload: SavedUpload, reason: string) {
    this.recovery.set({ upload, reason });
    this.uploadPhase.set("recovery");
    this.uploadLabel.set(reason);
  }
  async restartUpload() {
    const recovery = this.recovery();
    if (!recovery || this.busy() || recovery.upload.username !== this.me()?.username) return;
    try {
      this.forgetUpload(recovery.upload);
      this.requestedResume.set(null);
      this.recovery.set(null);
      this.activeSession.set(null);
      await this.upload();
    } catch (e) {
      this.fail(e);
    }
  }
  async upload() {
    if (!this.file || !this.me() || this.busy() || this.recovery()) return;
    const generation = this.authGeneration;
    const username = this.me()!.username;
    const file = this.file;
    const category = this.category;
    const metadata = {
      incidentId: category === "INCIDENT" ? this.incidentId : undefined,
      applicationId: category === "CONNECTION_DOCUMENT" ? this.applicationId : undefined,
      documentType: this.documentType,
      attachmentType: this.attachmentType,
      sensitivity: category === "CONNECTION_DOCUMENT" ? "SENSITIVE" : this.sensitivity,
    };
    const contextKey = JSON.stringify({
      incidentId: metadata.incidentId || "", applicationId: metadata.applicationId || "",
      documentType: metadata.documentType, attachmentType: metadata.attachmentType,
      sensitivity: metadata.sensitivity,
    });
    this.error.set("");
    this.notice.set("");
    this.busy.set(true);
    this.paused.set(false);
    this.progress.set(0);
    this.activeSession.set(null);
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    const current = () => generation === this.authGeneration && this.controller === controller;
    const check = () => {
      signal.throwIfAborted();
      if (!current()) throw new DOMException("Transfer încheiat", "AbortError");
    };
    let saved: SavedUpload | undefined;
    try {
      this.uploadPhase.set("hashing");
      const hash = await this.hashFile(file, signal);
      check();
      this.checksum.set(hash);
      const requested = this.requestedResume();
      if (requested && (requested.hash !== hash || requested.filename !== file.name ||
          (requested.sizeBytes !== undefined && requested.sizeBytes !== file.size)))
        throw new Error("Fișierul selectat nu corespunde transferului salvat. Selectează fișierul original sau renunță la selecția sesiunii.");
      const contentType = requested?.contentType || file.type || "application/octet-stream";
      saved = requested || this.saved().find(x =>
        x.hash === hash && x.category === category && x.username === username &&
        x.contextKey === contextKey && x.filename === file.name &&
        (x.sizeBytes === undefined || x.sizeBytes === file.size) &&
        (x.contentType === undefined || x.contentType === contentType),
      );
      if (!saved) {
        saved = { username, hash, category, filename: file.name, sizeBytes: file.size,
          contentType, contextKey, idempotencyKey: crypto.randomUUID() };
        this.saveUpload(saved);
      }
      let session: Session;
      this.uploadPhase.set("creating");
      this.uploadLabel.set("Recuperare / creare sesiune…");
      if (saved.sessionId) {
        try {
          session = await this.retry(() => this.api.request<Session>(
            "/upload-sessions/" + saved!.sessionId, { signal },
          ), signal);
        } catch (e) {
          check();
          if ((e as ApiError).status === 404) {
            this.recover(saved, "Sesiunea nu mai există. Poți începe o sesiune nouă.");
            return;
          }
          throw e;
        }
      } else {
        session = await this.retry(() => this.api.request<Session>("/upload-sessions", {
          method: "POST", signal,
          headers: { "Idempotency-Key": saved!.idempotencyKey! },
          body: JSON.stringify({ category, filename: file.name, contentType,
            sizeBytes: file.size, sha256: hash, ...metadata }),
        }), signal);
        check();
        saved = { ...saved, sessionId: session.sessionId };
        this.saveUpload(saved);
      }
      check();
      this.activeSession.set(session);
      const monitoring = ["AVAILABLE", "VERIFYING"].includes(session.status);
      if (["CANCELLED", "FAILED", "CORRUPTED"].includes(session.status)) {
        this.recover(saved, "Sesiunea este închisă (" + session.status + "). Poți începe o sesiune nouă.");
        return;
      }
      if (!monitoring && Date.parse(session.expiresAt) <= Date.now()) {
        this.recover(saved, "Sesiunea a expirat. Poți începe o sesiune nouă.");
        return;
      }
      if (!monitoring) {
        this.uploadPhase.set("uploading");
        if (session.uploadMode === "SINGLE") {
          this.uploadLabel.set("Se transferă fișierul…");
          if (session.status !== "UPLOADED")
            await this.retry(() => this.api.request(
              "/upload-sessions/" + session.sessionId + "/content",
              { method: "PUT", signal, headers: { "Content-Type": "application/octet-stream" }, body: file },
            ), signal);
          check();
          this.progress.set(100);
        } else {
          const done = new Map(session.confirmedParts.map(x => [x.number, x.sizeBytes]));
          const count = Math.ceil(file.size / session.partSizeBytes);
          let confirmedBytes = session.confirmedParts.reduce((sum, x) => sum + x.sizeBytes, 0);
          this.progress.set(Math.round(confirmedBytes / file.size * 100));
          for (let n = 1; n <= count; n++) {
            check();
            if (done.has(n)) continue;
            const part = file.slice((n - 1) * session.partSizeBytes,
              Math.min(n * session.partSizeBytes, file.size));
            const h = await createSHA256();
            check();
            h.init();
            const bytes = new Uint8Array(await part.arrayBuffer());
            check();
            h.update(bytes);
            const partHash = h.digest("hex");
            this.uploadLabel.set("Transfer parte " + n + " / " + count);
            await this.retry(() => this.api.request(
              "/upload-sessions/" + session.sessionId + "/parts/" + n,
              { method: "PUT", signal, headers: {
                "X-Part-SHA256": partHash, "Content-Type": "application/octet-stream",
              }, body: part },
            ), signal);
            check();
            confirmedBytes += part.size;
            this.progress.set(Math.round(confirmedBytes / file.size * 100));
          }
        }
        await this.retry(() => this.api.request(
          "/upload-sessions/" + session.sessionId + "/complete", { method: "POST", signal },
        ), signal);
        check();
        this.activeSession.set({ ...session, status: "VERIFYING" });
      }
      this.uploadPhase.set("verifying");
      this.progress.set(100);
      this.uploadLabel.set("Transfer încheiat · verificare în storage");
      for (let n = 0; n < 120; n++) {
        check();
        const result = await this.retry(() => this.api.request<FileRecord>(
          "/files/" + session.fileId, { signal },
        ), signal);
        check();
        if (result.status === "AVAILABLE") {
          this.forgetUpload(saved);
          this.requestedResume.set(null);
          this.activeSession.set({ ...session, status: "AVAILABLE" });
          this.uploadPhase.set("complete");
          this.notice.set("Fișier disponibil · SHA-256 verificat · " + result.storage);
          this.uploadLabel.set("Integritate confirmată");
          await this.refresh();
          return;
        }
        if (["FAILED", "CORRUPTED", "CANCELLED"].includes(result.status)) {
          this.recover(saved, "Fișierul este " + result.status + ". Poți începe o sesiune nouă.");
          return;
        }
        await this.wait(1000, signal);
      }
      this.notice.set("Verificarea continuă în fundal. Urmărește starea în Fișiere.");
    } catch (e) {
      if (!current()) return;
      if (this.paused()) this.notice.set("Sesiunea este păstrată. Reia cu același fișier.");
      else if (saved && (e as ApiError).code === "EXPIRED")
        this.recover(saved, "Sesiunea a expirat. Poți începe o sesiune nouă.");
      else this.fail(e);
    } finally {
      if (current()) {
        this.busy.set(false);
        this.controller = null;
      }
    }
  }
  async cancelUpload() {
    const session = this.activeSession();
    if (!session || this.cancelling() || ["AVAILABLE", "VERIFYING", "CANCELLED"].includes(session.status)) return;
    const generation = this.authGeneration;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const current = () => generation === this.authGeneration && this.controller === controller;
    this.cancelling.set(true);
    this.busy.set(true);
    this.paused.set(false);
    this.error.set("");
    this.notice.set("");
    const confirmedCancellation = () => {
      const saved = this.saved().find(x => x.username === this.me()?.username && x.sessionId === session.sessionId);
      if (saved) this.forgetUpload(saved);
      this.requestedResume.set(null);
      this.activeSession.set(null);
      this.recovery.set(null);
      this.uploadPhase.set("cancelled");
      this.uploadLabel.set("Transfer anulat pe server.");
      this.notice.set("Transfer anulat. Poți încărca fișierul într-o sesiune nouă.");
    };
    try {
      await this.retry(() => this.api.request("/upload-sessions/" + session.sessionId, {
        method: "DELETE", signal: controller.signal,
      }), controller.signal);
      if (!current()) return;
      confirmedCancellation();
    } catch (e) {
      if (!current()) return;
      if ((e as ApiError).status === 404) {
        const saved = this.saved().find(x => x.username === this.me()?.username && x.sessionId === session.sessionId);
        if (saved) this.recover(saved, "Sesiunea nu mai există. Poți începe o sesiune nouă.");
      } else {
        // Completion may race DELETE, or DELETE may succeed while its response is lost.
        if ((e as ApiError).status === 409 || (e as ApiError).status === undefined) {
          try {
            const latest = await this.api.request<Session>("/upload-sessions/" + session.sessionId, {
              signal: controller.signal,
            });
            if (!current()) return;
            if (latest.status === "CANCELLED") {
              confirmedCancellation();
              return;
            }
            this.activeSession.set(latest);
          } catch (lookupError) {
            if (!current()) return;
            if ((lookupError as ApiError).status === 404) {
              const saved = this.saved().find(x => x.username === this.me()?.username && x.sessionId === session.sessionId);
              if (saved) this.recover(saved, "Sesiunea nu mai există. Poți începe o sesiune nouă.");
              return;
            }
          }
        }
        this.fail(e);
        this.uploadLabel.set("Anularea nu a fost confirmată. Sesiunea este păstrată; reia pentru starea actuală.");
      }
    } finally {
      if (current()) {
        this.busy.set(false);
        this.cancelling.set(false);
        this.controller = null;
      }
    }
  }
  clearSessions() {
    if (this.busy()) return;
    try {
      localStorage.setItem("filegrid.uploads", JSON.stringify(
        this.saved().filter(x => x.username !== this.me()?.username),
      ));
      this.recovery.set(null);
      this.requestedResume.set(null);
      this.activeSession.set(null);
      this.notice.set("Referințele locale ale contului au fost șterse. Sesiunile serverului nu sunt anulate.");
    } catch (e) {
      this.fail(e);
    }
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
