import { signal, WritableSignal } from "@angular/core";
import { createSHA256 } from "hash-wasm";
import { Api, ApiError, FileRecord, Session, Incident } from "./api";

export interface UploadUser {
  username: string;
  role: string;
}

export interface SavedUpload {
  demoScope?: boolean;
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

export interface UploadHost {
  api: Api;
  me: WritableSignal<UploadUser | null>;
  busy: WritableSignal<boolean>;
  error: WritableSignal<string>;
  notice: WritableSignal<string>;
  incidents: WritableSignal<Incident[]>;
  generation(): number;
  canIncidents(): boolean;
  canDocuments(): boolean;
  refresh(): Promise<void>;
  incidentCreated?(incident: Incident): void;
  focus(selector: string): void;
  fail(error: unknown): void;
}

export class UploadController {
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

  constructor(private readonly host: UploadHost) {}

  destroy() {
    this.controller?.abort();
    this.controller = null;
  }

  reset() {
    this.controller?.abort();
    this.controller = null;
    this.host.busy.set(false);
    this.paused.set(false);
    this.cancelling.set(false);
    this.requestedResume.set(null);
    this.uploadPhase.set("idle");
    this.recovery.set(null);
    this.activeSession.set(null);
    this.file = null;
    this.incidentId = "";
    this.checksum.set("");
    this.progress.set(0);
    this.uploadLabel.set("");
    this.category = this.host.me()?.role === "CONNECTION_AGENT" ? "CONNECTION_DOCUMENT" : "INCIDENT";
    this.attachmentType = "BINARY";
    this.sensitivity = "SENSITIVE";
    this.applicationId = "DEMO-001";
    this.documentType = "APPLICATION";
    this.stationId = "ST-1001";
    this.zone = "Dobrogea";
    this.eventType = "VOLTAGE_DROP";
    this.severity = 3;
    this.affectedCustomers = 120;
    this.latitude = 44.18;
    this.longitude = 28.65;
    this.safetyCritical = false;
    this.incidentRequest = null;
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
  private incidentRequest: { body: string; key: string } | null = null;
  async createIncident() {
    if (this.host.busy()) return;
    const invalid = !this.stationId.trim() ? "station-id" : !this.zone.trim() ? "incident-zone" :
      !this.eventType.trim() ? "event-type" : !Number.isInteger(this.severity) || this.severity < 1 || this.severity > 5 ? "severity" :
      !Number.isInteger(this.affectedCustomers) || this.affectedCustomers < 0 ? "affected-customers" :
      this.latitude === null || !Number.isFinite(this.latitude) || Math.abs(this.latitude) > 90 ? "latitude" :
      this.longitude === null || !Number.isFinite(this.longitude) || Math.abs(this.longitude) > 180 ? "longitude" : "";
    if (invalid) {
      this.host.error.set("Completează câmpurile incidentului: severitate între 1 și 5, clienți întregi nenegativi și coordonate valide.");
      this.host.focus("#" + invalid);
      return;
    }
    const body = JSON.stringify({stationId:this.stationId, zone:this.zone, eventType:this.eventType,
      severity:this.severity, affectedCustomers:this.affectedCustomers, latitude:this.latitude,
      longitude:this.longitude, safetyCritical:this.safetyCritical});
    if(this.incidentRequest?.body !== body) this.incidentRequest = {body, key:crypto.randomUUID()};
    const generation = this.host.generation();
    this.host.error.set("");
    this.host.busy.set(true);
    try {
      const result = await this.host.api.request<Incident>("/incidents", {
        method: "POST",
        headers: { "Idempotency-Key": this.incidentRequest.key },
        body,
      });
      if (generation !== this.host.generation()) return;
      this.incidentId = result.id;
      this.host.incidentCreated?.(result);
      this.incidentRequest = null;
      this.host.notice.set(
        "Incident creat. Metadatele sunt disponibile; poți adăuga atașamentul.",
      );
      await this.host.refresh();
    } catch (e) {
      if (generation === this.host.generation()) this.host.fail(e);
    } finally {
      if (generation === this.host.generation()) this.host.busy.set(false);
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
    return this.saved().filter(x => x.username === this.host.me()?.username && (x.demoScope ?? false) === this.host.api.demoScope);
  }
  hasIncident(id: string) {
    return this.host.incidents().some(x => x.id === id);
  }
  restoreUpload(upload: SavedUpload) {
    if (this.host.busy() || upload.username !== this.host.me()?.username || (upload.demoScope ?? false) !== this.host.api.demoScope) return;
    try {
      if (upload.category === "CONNECTION_DOCUMENT" ? !this.host.canDocuments() : !this.host.canIncidents())
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
      this.host.error.set("");
      this.host.notice.set("");
    } catch (e) {
      this.host.fail(e);
    }
  }
  leaveResume() {
    if (this.host.busy()) return;
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
    if (!recovery || this.host.busy() || recovery.upload.username !== this.host.me()?.username) return;
    try {
      this.forgetUpload(recovery.upload);
      this.requestedResume.set(null);
      this.recovery.set(null);
      this.activeSession.set(null);
      await this.upload();
    } catch (e) {
      this.host.fail(e);
    }
  }
  async upload() {
    if (!this.file || !this.host.me() || this.host.busy() || this.recovery()) return;
    if (!this.file.size || this.file.size > (this.category === "DRONE_VIDEO" ? 20 * 1024 ** 3 : 10 * 1024 ** 2)) {
      this.host.fail(new Error("Selectează un fișier nenul: maximum 10 MiB pentru documente/avarii sau 20 GiB pentru drone."));
      return;
    }
    if (this.category === "CONNECTION_DOCUMENT" &&
        (!this.applicationId.trim() || !this.documentType.trim())) {
      this.host.fail(new Error("Completează ID-ul cererii și tipul documentului."));
      this.host.focus(!this.applicationId.trim() ? "#application-id" : "#document-type");
      return;
    }
    const generation = this.host.generation();
    const username = this.host.me()!.username;
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
    this.host.error.set("");
    this.host.notice.set("");
    this.host.busy.set(true);
    this.paused.set(false);
    this.progress.set(0);
    this.activeSession.set(null);
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    const current = () => generation === this.host.generation() && this.controller === controller;
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
        x.hash === hash && x.category === category && x.username === username && (x.demoScope ?? false) === this.host.api.demoScope &&
        x.contextKey === contextKey && x.filename === file.name &&
        (x.sizeBytes === undefined || x.sizeBytes === file.size) &&
        (x.contentType === undefined || x.contentType === contentType),
      );
      if (!saved) {
        saved = { username, hash, category, demoScope:this.host.api.demoScope, filename: file.name, sizeBytes: file.size,
          contentType, contextKey, idempotencyKey: crypto.randomUUID() };
        this.saveUpload(saved);
      }
      let session: Session;
      this.uploadPhase.set("creating");
      this.uploadLabel.set("Recuperare / creare sesiune…");
      if (saved.sessionId) {
        try {
          session = await this.retry(() => this.host.api.request<Session>(
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
        session = await this.retry(() => this.host.api.request<Session>("/upload-sessions", {
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
            await this.retry(() => this.host.api.request(
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
            await this.retry(() => this.host.api.request(
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
        await this.retry(() => this.host.api.request(
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
        const result = await this.retry(() => this.host.api.request<FileRecord>(
          "/files/" + session.fileId, { signal },
        ), signal);
        check();
        if (result.status === "AVAILABLE") {
          this.forgetUpload(saved);
          this.requestedResume.set(null);
          this.activeSession.set({ ...session, status: "AVAILABLE" });
          this.uploadPhase.set("complete");
          this.host.notice.set("Fișier disponibil · SHA-256 verificat · " + result.storage);
          this.uploadLabel.set("Integritate confirmată");
          await this.host.refresh();
          return;
        }
        if (["FAILED", "CORRUPTED", "CANCELLED"].includes(result.status)) {
          this.recover(saved, "Fișierul este " + result.status + ". Poți începe o sesiune nouă.");
          return;
        }
        await this.wait(1000, signal);
      }
      this.host.notice.set("Verificarea continuă în fundal. Urmărește starea în Fișiere.");
    } catch (e) {
      if (!current()) return;
      if (this.paused()) this.host.notice.set("Sesiunea este păstrată. Reia cu același fișier.");
      else if (saved && (e as ApiError).code === "EXPIRED")
        this.recover(saved, "Sesiunea a expirat. Poți începe o sesiune nouă.");
      else this.host.fail(e);
    } finally {
      if (current()) {
        this.host.busy.set(false);
        this.controller = null;
      }
    }
  }
  async cancelUpload() {
    const session = this.activeSession();
    if (!session || this.cancelling() || ["AVAILABLE", "VERIFYING", "CANCELLED"].includes(session.status)) return;
    const generation = this.host.generation();
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const current = () => generation === this.host.generation() && this.controller === controller;
    this.cancelling.set(true);
    this.host.busy.set(true);
    this.paused.set(false);
    this.host.error.set("");
    this.host.notice.set("");
    const confirmedCancellation = () => {
      const saved = this.saved().find(x => x.username === this.host.me()?.username && x.sessionId === session.sessionId);
      if (saved) this.forgetUpload(saved);
      this.requestedResume.set(null);
      this.activeSession.set(null);
      this.recovery.set(null);
      this.uploadPhase.set("cancelled");
      this.uploadLabel.set("Transfer anulat pe server.");
      this.host.notice.set("Transfer anulat. Poți încărca fișierul într-o sesiune nouă.");
    };
    try {
      await this.retry(() => this.host.api.request("/upload-sessions/" + session.sessionId, {
        method: "DELETE", signal: controller.signal,
      }), controller.signal);
      if (!current()) return;
      confirmedCancellation();
    } catch (e) {
      if (!current()) return;
      if ((e as ApiError).status === 404) {
        const saved = this.saved().find(x => x.username === this.host.me()?.username && x.sessionId === session.sessionId);
        if (saved) this.recover(saved, "Sesiunea nu mai există. Poți începe o sesiune nouă.");
      } else {
        // Completion may race DELETE, or DELETE may succeed while its response is lost.
        if ((e as ApiError).status === 409 || (e as ApiError).status === undefined) {
          try {
            const latest = await this.host.api.request<Session>("/upload-sessions/" + session.sessionId, {
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
              const saved = this.saved().find(x => x.username === this.host.me()?.username && x.sessionId === session.sessionId);
              if (saved) this.recover(saved, "Sesiunea nu mai există. Poți începe o sesiune nouă.");
              return;
            }
          }
        }
        this.host.fail(e);
        this.uploadLabel.set("Anularea nu a fost confirmată. Sesiunea este păstrată; reia pentru starea actuală.");
      }
    } finally {
      if (current()) {
        this.host.busy.set(false);
        this.cancelling.set(false);
        this.controller = null;
      }
    }
  }
  clearDemoReferences() {
    try {
      localStorage.setItem('filegrid.uploads',JSON.stringify(this.saved().filter(x=>!x.demoScope)));
    }catch{ /* Server reset remains authoritative if browser storage is unavailable. */ }
  }
  clearSessions() {
    if (this.host.busy()) return;
    try {
      localStorage.setItem("filegrid.uploads", JSON.stringify(
        this.saved().filter(x => x.username !== this.host.me()?.username),
      ));
      this.recovery.set(null);
      this.requestedResume.set(null);
      this.activeSession.set(null);
      this.host.notice.set("Referințele locale ale contului au fost șterse. Sesiunile serverului nu sunt anulate.");
    } catch (e) {
      this.host.fail(e);
    }
  }
}
