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
export class Api {
  private auth = "";
  setCredentials(username: string, password: string) {
    this.auth = "Basic " + btoa(username + ":" + password);
  }
  clear() {
    this.auth = "";
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.auth);
    headers.set("X-Correlation-ID", crypto.randomUUID());
    if (typeof init.body === "string")
      headers.set("Content-Type", "application/json");
    const response = await fetch("/api/v1" + path, { ...init, headers });
    if (!response.ok) {
      const problem = await response
        .json()
        .catch(() => ({ detail: response.statusText }));
      throw Object.assign(new Error(problem.detail || "Cererea a eșuat"), {
        status: response.status,
        code: problem.code,
        correlationId: problem.correlationId,
      });
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
  async downloadResponse(id: string) {
    const response = await fetch("/api/v1/files/" + id + "/content", {
      headers: {
        Authorization: this.auth,
        "X-Correlation-ID": crypto.randomUUID(),
      },
    });
    if (!response.ok) {
      const p = await response
        .json()
        .catch(() => ({ detail: "Descărcarea a eșuat" }));
      throw new Error(p.detail);
    }
    return response;
  }
}
