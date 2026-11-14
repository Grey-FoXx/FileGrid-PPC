import { CommonModule } from "@angular/common";
import { Component, computed, inject, input, signal } from "@angular/core";
import { WorkspaceStore } from "./workspace";
import { CommandIncident, CommandRegion, DEMO_SCENARIOS, DemoScenario } from "./demo-fixtures";

type ViewMode = "live" | "demo";
type RegionFilter = CommandRegion | "ALL";
interface LocatedIncident { incident: CommandIncident; x: number; y: number; region: CommandRegion }
interface IncidentCluster { key: string; x: number; y: number; members: LocatedIncident[] }

@Component({
  selector: "filegrid-command-center",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./command-center.html",
  styleUrl: "./command-center.css",
  host: { style: "display:block; min-width:0" },
})
export class CommandCenter {
  readonly vm = inject(WorkspaceStore);
  readonly demoOnly = input(false);
  readonly mode = signal<ViewMode>("live");
  readonly scenario = signal<DemoScenario>("normal");
  readonly region = signal<RegionFilter>("ALL");
  readonly selectedId = signal<string | null>(null);
  readonly expandedCluster = signal<string | null>(null);
  readonly zoom = signal(1);
  readonly scenarioOptions = Object.entries(DEMO_SCENARIOS) as [DemoScenario, typeof DEMO_SCENARIOS[DemoScenario]][];
  readonly regions: RegionFilter[] = ["ALL", "Muntenia", "Banat", "Dobrogea"];
  readonly currentMode = computed<ViewMode>(() => this.demoOnly() ? "demo" : this.mode());
  readonly scenarioData = computed(() => DEMO_SCENARIOS[this.scenario()]);
  readonly incidents = computed<CommandIncident[]>(() => this.currentMode() === "demo"
    ? this.scenarioData().incidents
    : this.vm.incidents().slice(0, 25).map(item => item as CommandIncident));
  readonly visibleIncidents = computed(() => this.region() === "ALL" ? this.incidents() :
    this.incidents().filter(item => this.incidentRegion(item) === this.region()));
  readonly located = computed<LocatedIncident[]>(() => this.visibleIncidents().flatMap(incident => {
    const point = this.coordinates(incident);
    const region = this.incidentRegion(incident);
    return point && region ? [{ incident, x: point.x, y: point.y, region }] : [];
  }));
  readonly unmapped = computed(() => this.visibleIncidents().filter(item => !this.coordinates(item) || !this.incidentRegion(item)));
  readonly clusters = computed<IncidentCluster[]>(() => {
    const bins = new Map<string, LocatedIncident[]>();
    for (const item of this.located()) {
      const key = `${Math.floor(item.x / 34)}-${Math.floor(item.y / 34)}`;
      bins.set(key, [...(bins.get(key) || []), item]);
    }
    return [...bins.entries()].map(([key, members]) => ({
      key, x: members.reduce((sum, item) => sum + item.x, 0) / members.length,
      y: members.reduce((sum, item) => sum + item.y, 0) / members.length, members,
    }));
  });
  readonly selected = computed(() => this.incidents().find(item => item.id === this.selectedId()) ||
    (this.currentMode() === "demo" ? this.visibleIncidents()[0] || null : null));
  readonly selectedFiles = computed(() => this.selected()?.attachments || []);
  readonly counts = computed(() => {
    const items = this.incidents();
    return {
      incidents: items.length,
      critical: items.filter(item => item.severity >= 4).length,
      completed: items.filter(item => item.mlStatus === "COMPLETED").length,
      availableFiles: items.reduce((sum, item) => sum + item.attachments.filter(file => file.status === "AVAILABLE").length, 0),
    };
  });

  setMode(mode: ViewMode) {
    if (this.demoOnly() && mode === "live") return;
    this.mode.set(mode);
    this.region.set("ALL"); this.expandedCluster.set(null); this.selectedId.set(null);
  }
  setScenario(scenario: DemoScenario) {
    this.scenario.set(scenario); this.region.set("ALL"); this.expandedCluster.set(null); this.selectedId.set(null);
  }
  selectRegion(region: RegionFilter) {
    this.region.set(region); this.expandedCluster.set(null); this.selectedId.set(null);
  }
  selectIncident(item: CommandIncident) {
    this.selectedId.set(item.id);
    window.setTimeout(() => document.querySelector<HTMLElement>(".cc-detail-head h3")?.focus(), 0);
  }
  setZoom(delta: number) { this.zoom.update(value => Math.max(0.8, Math.min(1.45, +(value + delta).toFixed(2)))); }
  clusterExpanded(key: string) { return this.expandedCluster() === key; }
  clusterMembers(key: string) { return this.clusters().find(cluster => cluster.key === key)?.members || []; }
  clusterMid(cluster: IncidentCluster) { return !this.clusterHigh(cluster) && cluster.members.some(item => item.incident.severity === 3); }
  clusterHigh(cluster: IncidentCluster) { return cluster.members.some(item => item.incident.severity >= 4); }
  regionCount(region: RegionFilter) {
    return region === "ALL" ? this.incidents().length : this.incidents().filter(item => this.incidentRegion(item) === region).length;
  }
  markerLabel(item: LocatedIncident) {
    return `${item.incident.stationId}, ${item.incident.zone}, severitate ${item.incident.severity}, ${this.fileSummary(item.incident)}, analiză ${item.incident.mlStatus}`;
  }
  fileSummary(item: CommandIncident) {
    if (!item.attachments.length) return "fără fișiere";
    return item.attachments.map(file => `fișier ${file.status}`).join(", ");
  }
  fileClass(status: string) {
    return ({ AVAILABLE: "available", VERIFYING: "verifying", FAILED: "failed", CORRUPTED: "failed", CANCELLED: "failed" } as Record<string, string>)[status] || "pending";
  }
  lifecycleLabel(status: string) {
    if (status === "AVAILABLE") return "Disponibil · integritate raportată de API";
    if (status === "VERIFYING") return "Transfer primit · verificare în curs";
    if (status === "UPLOADED") return "Transfer primit · verificare încă neconfirmată";
    if (["FAILED", "CORRUPTED", "CANCELLED"].includes(status)) return `Transfer cu stare ${status}`;
    return `Transfer: ${status}`;
  }
  incidentRegion(item: CommandIncident): CommandRegion | null {
    if (this.currentMode() === "demo" && item.region) return item.region;
    const lat = item.latitude, lon = item.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lon! >= 27.2 && lat! >= 43.4 && lat! <= 45.8) return "Dobrogea";
    if (lon! >= 20 && lon! < 23.35 && lat! >= 44.4 && lat! <= 46.5) return "Banat";
    if (lon! >= 23.2 && lon! < 27.4 && lat! >= 43.3 && lat! <= 46.7) return "Muntenia";
    return null;
  }
  private coordinates(item: CommandIncident): { x: number; y: number } | null {
    const lat = item.latitude, lon = item.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat! < 43.2 || lat! > 48.4 || lon! < 20 || lon! > 29.9) return null;
    return { x: 36 + (lon! - 20) / 9.9 * 418, y: 28 + (48.4 - lat!) / 5.2 * 460 };
  }
}
