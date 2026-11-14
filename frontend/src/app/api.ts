import { signal } from "@angular/core";
export interface FileRecord {
  id: string;
  category: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  integrityStatus: string;
  storage: string;
  owner: string;
  policyVersion: string;
  routingReason: string;
  createdAt: string;
}
export interface Session {
  sessionId: string;
  fileId: string;
  uploadMode: "SINGLE" | "MULTIPART";
  partSizeBytes: number;
  expiresAt: string;
  status: string;
  confirmedParts: { number: number; sha256: string; sizeBytes: number }[];
}
export interface Analysis {
  priorityScore: number;
  priorityClass: string;
  clusterId?: number;
  clusterSize?: number;
  recommendation: string;
  reasons: string[];
  synthetic: boolean;
  modelVersions?: Record<string, string>;
  policyVersion?: string;
  timestamp?: string;
}
export interface DemoState {
 enabled: boolean; initialized: boolean; mode: 'NORMAL'|'STORM'; generating: boolean; seedVersion: string | number;
}
export type InterventionStatus = 'NEW'|'DISPATCHED'|'RESOLVED';
export interface IncidentGroup {
 id: string; status: InterventionStatus; zone: string; eventType: string; severity: number;
 latitude?: number; longitude?: number; incidents: Incident[];
}
export interface WorkspaceUser { username: string; role: string; features?: {demo?: boolean; incidentGroups?: boolean}; }
export interface Incident {
  groupId?: string;
  interventionStatus?: InterventionStatus;
  id: string;
  latitude?: number;
  longitude?: number;
  occurredAt?: string;
  createdAt?: string;
  stationId: string;
  zone: string;
  eventType: string;
  severity: number;
  affectedCustomers: number;
  safetyCritical?: boolean;
  mlStatus: string;
  analysis: Analysis | null;
  attachments: FileRecord[];
}
export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}
export interface Reading {
  readingId: string;
  meterId: string;
  sequenceNumber: number;
  energyKwh: number;
  fileId: string;
  measuredAt: string;
}
export interface ApiError extends Error {
  status?: number;
  code?: string;
  correlationId?: string;
}
export interface RequestTrace { correlationId: string; path: string; at: string; status: number; durationMs: number; fileId?: string; }
export class Api {
  demoScope = false;
  readonly traces = signal<RequestTrace[]>([]);
  private sessionFiles = new Map<string,string>();
  private auth = "";
  private credentials = new AbortController();
  constructor(private onUnauthorized: () => void = () => {}) {}
  setCredentials(username: string, password: string) {
    this.clear();
    this.auth = "Basic " + btoa(username + ":" + password);
  }
  clear() {
    this.credentials.abort();
    this.credentials = new AbortController();
    this.auth = "";
    this.demoScope = false;
    this.traces.set([]);
    this.sessionFiles.clear();
  }
  private async check(response: Response, credentials: AbortController) {
    credentials.signal.throwIfAborted();
    if (response.ok) return;
    const problem = await response.json().catch(() => ({}));
    credentials.signal.throwIfAborted();
    const error: ApiError = Object.assign(
      new Error(problem.detail || response.statusText || "Cererea a eșuat"),
      {
        status: response.status,
        code: problem.code,
        correlationId: problem.correlationId || response.headers.get("X-Correlation-ID"),
      },
    );
    if (response.status === 401 && credentials === this.credentials)
      this.onUnauthorized();
    throw error;
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.auth);
    if(this.demoScope) headers.set("X-FileGrid-Demo", "true");
    const correlationId = crypto.randomUUID();
    headers.set("X-Correlation-ID", correlationId);
    const started = performance.now();
    const at = new Date().toISOString();
    if (typeof init.body === "string")
      headers.set("Content-Type", "application/json");
    const credentials = this.credentials;
    const response = await fetch("/api/v1" + path, {
      ...init,
      headers,
      signal: init.signal
        ? AbortSignal.any([init.signal, credentials.signal])
        : credentials.signal,
    });
    await this.check(response, credentials);
    const value = (response.status === 204 ? undefined : await response.json()) as T;
    credentials.signal.throwIfAborted();
    init.signal?.throwIfAborted();
    if (path.startsWith('/upload-sessions')) {
      const session = (value || {}) as Partial<Session>;
      if(session.sessionId && session.fileId) this.sessionFiles.set(session.sessionId,session.fileId);
      const sessionId = path.split('/')[2];
      const fileId = session.fileId || this.sessionFiles.get(sessionId);
      if ((init.method || 'GET') !== 'GET') this.traces.update(rows=>[...rows.slice(-31), {correlationId:response.headers.get('X-Correlation-ID') || correlationId,
        path, at, status:response.status, durationMs:performance.now()-started, fileId}]);
    }
    return value;
  }
  async downloadResponse(id: string, signal?: AbortSignal) {
    const credentials = this.credentials;
    const response = await fetch("/api/v1/files/" + id + "/content", {
      signal: signal ? AbortSignal.any([signal, credentials.signal]) : credentials.signal,
      headers: {
        Authorization: this.auth,
        ...(this.demoScope ? {"X-FileGrid-Demo":"true"} : {}),
        "X-Correlation-ID": crypto.randomUUID(),
      },
    });
    await this.check(response, credentials);
    return response;
  }
}
