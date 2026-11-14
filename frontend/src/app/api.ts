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
  clusterId: number;
  clusterSize: number;
  recommendation: string;
  reasons: string[];
  synthetic: boolean;
  modelVersions: Record<string, string>;
}
export interface Incident {
  id: string;
  stationId: string;
  zone: string;
  eventType: string;
  severity: number;
  affectedCustomers: number;
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
export class Api {
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
    headers.set("X-Correlation-ID", crypto.randomUUID());
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
    if (response.status === 204) return undefined as T;
    const value = (await response.json()) as T;
    credentials.signal.throwIfAborted();
    init.signal?.throwIfAborted();
    return value;
  }
  async downloadResponse(id: string) {
    const credentials = this.credentials;
    const response = await fetch("/api/v1/files/" + id + "/content", {
      signal: credentials.signal,
      headers: {
        Authorization: this.auth,
        "X-Correlation-ID": crypto.randomUUID(),
      },
    });
    await this.check(response, credentials);
    return response;
  }
}
