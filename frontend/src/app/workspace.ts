import { Injectable, OnDestroy, signal } from "@angular/core";
import { DownloadController } from "./download";
import { UploadController } from "./upload";
import { SectionState } from "./section-state";
import { Api, ApiError, FileRecord, Incident, Reading, Page } from "./api";
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
@Injectable()
export class WorkspaceStore implements OnDestroy {
  api = new Api(() => {
    if (!this.me()) return;
    this.logout();
    this.error.set("Autentificarea nu mai este validă. Autentifică-te din nou.");
  });
  downloads = new DownloadController(this.api);
  states = signal<Record<string, SectionState>>({});
  private lastRefreshError = "";
  windowMinutes = signal<number | null>(null);
  snapshots = signal<Record<string, { at: string; window: number | null; series: Series[] }>>({});
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
  statusFilter = "";
  incidentPage = signal(0);
  incidentTotal = signal(0);
  meterPage = signal(0);
  meterTotal = signal(0);
  meterFilter = "";
  incidentSearch = "";
  incidentML = "";
  incidentSort = "auto";
  filePage = signal(0);
  fileTotal = signal(0);
  selectedFile = signal<FileRecord | null>(null);
  uploads = new UploadController(this);
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
  generation() { return this.authGeneration; }
  ngOnDestroy() {
    clearInterval(this.timer);
    this.uploads.destroy();
    this.refreshController?.abort();
    this.api.clear();
    this.downloads.reset();
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
      if (!["ADMIN", "DISPATCHER", "FIELD_OPERATOR", "CONNECTION_AGENT"].includes(me.role))
        throw new Error("Acest cont este destinat ingestiei automate. Folosește un cont de operator pentru interfață.");
      this.me.set(me);
      this.password = "";
      this.uploads.category = me.role === "CONNECTION_AGENT" ? "CONNECTION_DOCUMENT" : "INCIDENT";
      this.tab.set(this.canStats() ? "dashboard" : "files");
      this.focus("#workspace-content h1");
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
    this.uploads.destroy();
    this.refreshController?.abort();
    this.api.clear();
    this.me.set(null);
    this.password = "";
    this.downloads.reset();
    this.states.set({});
    this.snapshots.set({});
    this.windowMinutes.set(null);
    this.lastRefreshError = "";
    this.statusFilter = "";
    this.incidentPage.set(0);
    this.incidentTotal.set(0);
    this.meterPage.set(0);
    this.meterTotal.set(0);
    this.meterFilter = "";
    this.incidentSearch = "";
    this.incidentML = "";
    this.incidentSort = "auto";
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
    this.uploads.reset();
    this.notice.set("");
    this.error.set("");
  }
  async go(tab: string) {
    if ((!this.canStats() && ["dashboard", "meters"].includes(tab)) ||
        (!this.canIncidents() && tab === "incidents")) return;
    this.tab.set(tab);
    window.scrollTo({ top: 0 });
    this.focus("#workspace-content h1");
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
    const load = async <T>(section: string, path: string, apply: (value: T) => void) => {
      this.states.update(states => ({ ...states, [section]: {
        loading: true, error: "", updatedAt: states[section]?.updatedAt || null,
      } }));
      try {
        const value = await this.api.request<T>(path, { signal: controller.signal });
        if (current()) {
          apply(value);
          this.states.update(states => ({ ...states, [section]: { loading: false, error: "", updatedAt: new Date().toISOString() } }));
        }
      } catch (e) {
        if (!current()) return;
        const problem = e as ApiError;
        if (problem.status === undefined) networkFailure = true;
        const message = this.problemMessage(e);
        errors.push(message);
        this.states.update(states => ({ ...states, [section]: { ...states[section], loading: false, error: message } }));
      }
    };
    const q = new URLSearchParams({
      page: String(this.filePage()), size: "25", search: this.search, category: this.categoryFilter, status: this.statusFilter,
    });
    const requests: Promise<void>[] = [
      load<Page<FileRecord>>("files", "/files?" + q, f => {
        this.files.set(f.items);
        this.fileTotal.set(f.total);
      }),
    ];
    if (this.canStats()) {
      requests.push(
        load<Business>("business", "/stats/business", b => this.business.set(b)),
        load<Page<Incident>>("incidents", "/incidents?page=" + this.incidentPage() + "&size=25", i => { this.incidents.set(i.items); this.incidentTotal.set(i.total); }),
        load<Page<Reading>>("meters", "/meter-readings?page=" + this.meterPage() + "&size=25" + (this.meterFilter ? "&meterId=" + encodeURIComponent(this.meterFilter.trim()) : ""), m => { this.readings.set(m.items); this.meterTotal.set(m.total); }),
        load<{ series: Series[]; windowMinutes?: number }>("technical", "/stats/technical", t => { this.series.set(t.series); this.windowMinutes.set(t.windowMinutes ?? null); }),
      );
    } else if (this.me()?.role === "FIELD_OPERATOR") {
      requests.push(load<Page<Incident>>("incidents", "/incidents?page=" + this.incidentPage() + "&size=25", i => { this.incidents.set(i.items); this.incidentTotal.set(i.total); }));
    }
    if (this.tab() === "policies")
      requests.push(load<unknown>("policies", "/policies", p => this.policies.set(p)));
    await Promise.all(requests);
    if (!current()) return;
    this.online.set(!networkFailure);
    if (errors.length) {
      this.lastRefreshError = [...new Set(errors)].join(" · ");
      this.error.set(this.lastRefreshError);
    } else if (this.error() === this.lastRefreshError) this.error.set("");
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
  async download(file: FileRecord) {
    const generation = this.authGeneration;
    this.error.set("");
    this.notice.set("");
    try {
      if (await this.downloads.run(file) && generation === this.authGeneration)
        this.notice.set("Descărcare verificată: SHA-256 original = SHA-256 recuperat.");
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
    this.uploads.incidentId = incident.id;
    this.uploads.category = "INCIDENT";
    this.uploads.requestedResume.set(null);
    this.uploads.recovery.set(null);
    void this.go("upload");
  }
  bytes(n: number) {
    if (!Number.isFinite(n)) return "—";
    if (n > 0 && n < 0.01) return "<0.01 B";
    if (n < 1024) return (Number.isInteger(n) ? String(n) : n.toFixed(2)) + " B";
    if (n < 1024 ** 2) return (n / 1024).toFixed(1) + " KiB";
    if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + " MiB";
    return (n / 1024 ** 3).toFixed(2) + " GiB";
  }
  focus(selector: string) {
    window.setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 0);
  }
  openDetails(file: FileRecord, event: Event) {
    this.detailsTrigger = event.currentTarget as HTMLElement;
    this.selectedFile.set(file);
    this.focus("#file-details-heading");
  }
  private detailsTrigger: HTMLElement | null = null;
  closeDetails() {
    this.selectedFile.set(null);
    this.detailsTrigger?.focus();
  }
  async pageList(kind: "incidents" | "meters", delta: number) {
    (kind === "incidents" ? this.incidentPage : this.meterPage).update(page => Math.max(0, page + delta));
    await this.refresh();
  }
  async filterMeters() {
    this.meterPage.set(0);
    await this.refresh();
  }
  visibleIncidents() {
    const search = this.incidentSearch.toLocaleLowerCase("ro").trim();
    const rows = this.incidents().filter(i =>
      (!search || [i.stationId, i.zone, i.eventType].join(" ").toLocaleLowerCase("ro").includes(search)) &&
      (!this.incidentML || i.mlStatus === this.incidentML),
    );
    const priority = this.incidentSort === "priority" || (this.incidentSort === "auto" && this.business()?.mode === "STORM");
    const safetyFirst = (incident: Incident) => Number(incident.safetyCritical === true || incident.analysis?.recommendation === "IMMEDIATE_HUMAN_REVIEW");
    return priority ? [...rows].sort((a, b) => safetyFirst(b) - safetyFirst(a) ||
      (b.analysis?.priorityScore ?? b.severity * 20) - (a.analysis?.priorityScore ?? a.severity * 20)) : rows;
  }
  mlMessage(status: string) {
    return ({ NOT_REQUESTED: "Analiza începe după verificarea primului atașament.", PENDING: "Analiza așteaptă procesarea.",
      RUNNING: "Modelele procesează incidentul.", FAILED: "Analiza ML a eșuat. Fișierele disponibile pot fi descărcate în continuare.",
      COMPLETED: "Analiza este finalizată; rezultatul nu a fost încă primit." } as Record<string, string>)[status] || "Starea analizei nu este cunoscută.";
  }
  decisionLabel(code: string) {
    return ({ IMMEDIATE_HUMAN_REVIEW: "Evaluare umană imediată", HIGH_PRIORITY_REVIEW: "Evaluare cu prioritate ridicată",
      SPECIALIST_REVIEW: "Evaluare de specialitate", STANDARD_REVIEW: "Evaluare standard" } as Record<string, string>)[code] || code;
  }
  captureSnapshot() {
    const mode = this.business()?.mode;
    if (!mode || !["NORMAL", "STORM"].includes(mode) || this.states()["technical"]?.error || this.states()["technical"]?.loading ||
        this.states()["business"]?.error || this.states()["business"]?.loading || !this.states()["technical"]?.updatedAt) return;
    this.snapshots.update(s => ({ ...s, [mode]: { at: new Date().toISOString(), window: this.windowMinutes(), series: structuredClone(this.series()) } }));
  }
  comparisonRows() {
    const snapshots = this.snapshots();
    const key = (s: Series) => [s.category, s.storage, s.operation].join("/");
    const normal = new Map((snapshots["NORMAL"]?.series || []).map(s => [key(s), s]));
    const storm = new Map((snapshots["STORM"]?.series || []).map(s => [key(s), s]));
    return [...new Set([...normal.keys(), ...storm.keys()])].map(key => ({ key, normal: normal.get(key), storm: storm.get(key) }));
  }
  pageLabel() {
    return (this.tabs.find(item => item[0] === this.tab())?.[2] || "FileGrid").toLocaleUpperCase("ro");
  }
  fileCategories() {
    if (this.canStats()) return ["METER_READING", "INCIDENT", "CONNECTION_DOCUMENT", "DRONE_VIDEO"];
    return this.canDocuments() ? ["CONNECTION_DOCUMENT"] : ["INCIDENT", "DRONE_VIDEO"];
  }
  policyRules() {
    const value = this.policies() as { rules?: { id?: string; category?: string; storage?: string; attachmentType?: string; sensitivity?: string }[] } | null;
    return Array.isArray(value?.rules) ? value.rules : [];
  }
  private problemMessage(e: unknown) {
    const x = e as ApiError;
    const message = x.status === 403
      ? "Nu ai permisiunea pentru această operație. " + x.message
      : x.message || String(e);
    return message + (x.correlationId ? " · ID " + x.correlationId : "");
  }
  fail(e: unknown) {
    if ((e as Error).name !== "AbortError") {
      this.error.set(this.problemMessage(e));
      this.focus("[data-error-summary]");
    }
  }
}
