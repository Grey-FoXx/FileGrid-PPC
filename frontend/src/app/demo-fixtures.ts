import { Incident } from "./api";

export type CommandRegion = "Muntenia" | "Banat" | "Dobrogea";
export type DemoScenario = "normal" | "storm" | "recovery";
export type CommandIncident = Incident & {
  latitude?: number;
  longitude?: number;
  occurredAt?: string;
  createdAt?: string;
  region?: CommandRegion;
};

const versions = { impact: "rf-demo-3.2", correlation: "dbscan-demo-2.1" };
const point = (id: number, stationId: string, zone: CommandRegion, latitude: number, longitude: number,
  mlStatus: string, fileStatus: string, severity: number, occurredAt: string): CommandIncident => {
  const complete = mlStatus === "COMPLETED";
  return {
    id: `demo-${id}`, stationId, zone, region: zone, latitude, longitude, occurredAt,
    eventType: ["VOLTAGE_DROP", "LINE_INSPECTION", "TRANSFORMER_ALERT"][id % 3],
    severity, affectedCustomers: 18 + id * 23, safetyCritical: severity === 5,
    mlStatus,
    analysis: complete ? {
      priorityScore: 42 + (id * 11) % 56,
      priorityClass: severity >= 4 ? "HIGH" : "MEDIUM",
      clusterId: 10 + id % 4, clusterSize: 2 + id % 5,
      recommendation: severity === 5 ? "IMMEDIATE_HUMAN_REVIEW" : severity >= 4 ? "HIGH_PRIORITY_REVIEW" : "SPECIALIST_REVIEW",
      reasons: ["Semnal sintetic pentru demonstrație", "Impact estimat din datele fixture"],
      synthetic: true, modelVersions: versions, policyVersion: "decision-demo-1.0", timestamp: occurredAt,
    } : null,
    attachments: [{
      id: `demo-file-${id}`, category: "INCIDENT", filename: `demo-inspection-${id}.jpg`,
      contentType: "image/jpeg", sizeBytes: 820_000 + id * 1000,
      sha256: "0".repeat(64), status: fileStatus, integrityStatus: fileStatus === "AVAILABLE" ? "VERIFIED" : "PENDING",
      storage: "S3", owner: "demo", policyVersion: "demo", routingReason: "synthetic fixture", createdAt: occurredAt,
    }],
  };
};

const normal: CommandIncident[] = [
  point(1, "MN-104", "Muntenia", 44.43, 26.10, "COMPLETED", "AVAILABLE", 2, "2026-11-14T08:12:00Z"),
  point(2, "MN-208", "Muntenia", 44.72, 25.48, "PENDING", "VERIFYING", 3, "2026-11-14T08:24:00Z"),
  point(3, "BT-031", "Banat", 45.75, 21.23, "COMPLETED", "AVAILABLE", 2, "2026-11-14T08:37:00Z"),
  point(4, "BT-077", "Banat", 45.30, 22.10, "NOT_REQUESTED", "AVAILABLE", 1, "2026-11-14T08:42:00Z"),
  point(5, "DB-014", "Dobrogea", 44.18, 28.65, "RUNNING", "AVAILABLE", 3, "2026-11-14T08:49:00Z"),
  point(6, "DB-029", "Dobrogea", 44.62, 27.95, "FAILED", "AVAILABLE", 4, "2026-11-14T08:54:00Z"),
];
const storm: CommandIncident[] = [
  point(11, "MN-511", "Muntenia", 44.45, 26.08, "PENDING", "VERIFYING", 5, "2026-11-14T09:02:00Z"),
  point(12, "MN-522", "Muntenia", 44.61, 25.82, "RUNNING", "AVAILABLE", 4, "2026-11-14T09:06:00Z"),
  point(13, "MN-536", "Muntenia", 45.10, 26.25, "COMPLETED", "AVAILABLE", 5, "2026-11-14T09:10:00Z"),
  point(14, "BT-301", "Banat", 45.76, 21.24, "FAILED", "AVAILABLE", 4, "2026-11-14T09:13:00Z"),
  point(15, "BT-319", "Banat", 45.58, 22.34, "COMPLETED", "AVAILABLE", 5, "2026-11-14T09:18:00Z"),
  point(16, "DB-418", "Dobrogea", 44.18, 28.65, "RUNNING", "VERIFYING", 5, "2026-11-14T09:21:00Z"),
  point(17, "DB-426", "Dobrogea", 44.40, 28.20, "PENDING", "AVAILABLE", 4, "2026-11-14T09:24:00Z"),
  point(18, "DB-433", "Dobrogea", 44.72, 28.45, "COMPLETED", "AVAILABLE", 5, "2026-11-14T09:27:00Z"),
];
const recovery: CommandIncident[] = [
  point(21, "MN-701", "Muntenia", 44.52, 26.12, "COMPLETED", "AVAILABLE", 4, "2026-11-14T10:12:00Z"),
  point(22, "MN-708", "Muntenia", 44.88, 25.22, "FAILED", "AVAILABLE", 3, "2026-11-14T10:18:00Z"),
  point(23, "BT-601", "Banat", 45.74, 21.20, "COMPLETED", "AVAILABLE", 3, "2026-11-14T10:25:00Z"),
  point(24, "BT-614", "Banat", 45.22, 22.02, "NOT_REQUESTED", "VERIFYING", 2, "2026-11-14T10:30:00Z"),
  point(25, "DB-801", "Dobrogea", 44.19, 28.66, "COMPLETED", "AVAILABLE", 2, "2026-11-14T10:35:00Z"),
  point(26, "DB-819", "Dobrogea", 44.55, 27.70, "FAILED", "AVAILABLE", 3, "2026-11-14T10:41:00Z"),
];

export const DEMO_SCENARIOS: Record<DemoScenario, { title: string; description: string; mode: "NORMAL" | "STORM" | "RECOVERY"; incidents: CommandIncident[] }> = {
  normal: { title: "Normal", description: "Flux redus, incidente distribuite și verificări obișnuite.", mode: "NORMAL", incidents: normal },
  storm: { title: "Storm", description: "Val de raportări; severitatea și stările de procesare sunt ilustrative.", mode: "STORM", incidents: storm },
  recovery: { title: "Recovery", description: "Urmărirea recuperării după un val de raportări; exemplele sunt fixe.", mode: "RECOVERY", incidents: recovery },
};
