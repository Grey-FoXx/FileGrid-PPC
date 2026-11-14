import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { WorkspaceStore } from "../workspace";
import { SectionStateComponent } from "../section-state";
import { decideDestination } from "./decision-lab";

@Component({
  selector: "filegrid-policies",
  standalone: true,
  imports: [CommonModule, FormsModule, SectionStateComponent],
  templateUrl: "./policies.html",
  host: { style: "display:block; min-width:0" },
  styles: [`
    :host { display: block; min-width:0; }
    .rule-step, .actual-record, .metric-card, .view-tabs button { overflow-wrap:anywhere; min-width:0; max-width:100%; }
    .rule-step > *, .panel-heading > * { min-width:0; max-width:100%; }
    .panel-heading { flex-wrap:wrap; }
    .lab-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(260px, .8fr); gap: 18px; align-items: start; }
    .decision-flow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
    .flow-step, .rule-step, .destination-card, .metric-card, .actual-record { min-width: 0; border: 1px solid #dfe8e3; border-radius: 9px; background: #fff; padding: 15px; }
    .flow-step { background: #f5f8f6; animation: reveal .18s ease-out both; }
    @keyframes reveal { from { opacity: .75; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) { .flow-step { animation: none; } }
    .flow-step strong, .flow-step small { display: block; overflow-wrap: anywhere; }
    .step-number { display: inline-grid; place-items: center; width: 27px; height: 27px; border-radius: 50%; background: #e2efe8; color: #17523e; font-weight: 700; margin-bottom: 10px; }
    .destination-card { background: #eaf4ee; border-color: #bed8c8; }
    .destination-card h3 { font-size: 19px; margin: 7px 0; overflow-wrap: anywhere; }
    .rule-list, .metric-list, .actual-list { display: grid; gap: 9px; padding: 0; list-style: none; margin: 12px 0; }
    .rule-step { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start; }
    .rule-step.is-match { border-color: #348466; box-shadow: inset 3px 0 #348466; background: #f0f7f3; }
    .rule-step.is-skipped { opacity: .72; }
    .rule-step p, .rule-step small { margin: 3px 0 0; overflow-wrap: anywhere; }
    .metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .metric-card strong { display: block; font-size: 18px; margin: 5px 0; }
    .metric-card small { display: block; overflow-wrap: anywhere; }
    .actual-record { display: grid; gap: 7px; }
    .actual-record code { overflow-wrap: anywhere; }
    .simulation-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
    .simulation-form label { min-width: 0; }
    .callout { overflow-wrap: anywhere; }
    .simulated { border-left: 4px solid #b57913; background: #fff8e8; color: #563b09; padding: 12px 14px; border-radius: 5px; }
    .technology-chip { display: inline-flex; border-radius: 999px; background: #fff; border: 1px solid #cbded2; color: #24553f; padding: 5px 10px; font-size: 12px; font-weight: 650; }
    .target-result { border-radius: 6px; padding: 10px 12px; background: #eff5f1; }
    .target-result.is-invalid { background: #fff0e9; color: #773b20; }
    @media (max-width: 760px) { .lab-grid { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 550px) { .decision-flow, .metric-grid, .simulation-form { grid-template-columns: minmax(0, 1fr); } .rule-step { grid-template-columns: auto minmax(0, 1fr); } .rule-step > :last-child { grid-column: 2; } }
  `],
})
export class PoliciesPage {
  readonly vm = inject(WorkspaceStore);
  view: "explore" | "simulate" = "explore";
  category = "INCIDENT";
  attachmentType = "BINARY";
  sensitivity = "SENSITIVE";
  sizeMiB = 5;
  hypotheticalTarget = "S3";
  readonly targets = ["DATABASE", "S3", "FTP"];

  get decision() {
    return decideDestination(this.vm.policyRules(), {
      category: this.category,
      attachmentType: this.attachmentType,
      sensitivity: this.sensitivity,
      sizeMiB: Number(this.sizeMiB),
    }, this.hypotheticalTarget);
  }

  get actualExample() {
    return this.vm.files()
      .filter(file => file.category === this.category && file.status === "AVAILABLE")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
  }

  get categoryMetrics() {
    return this.vm.series().filter(series => series.category === this.category);
  }

  get policyVersion() {
    const value = this.vm.policies() as { version?: string | number } | null;
    return value?.version ?? "—";
  }

  get policyRules() {
    return this.vm.policyRules();
  }

  get allowedStorageLabels() {
    return this.decision.allowedDestinations.map(storage => this.storageLabel(storage)).join(" sau ");
  }

  get hypotheticalTargetMessage() {
    if (!this.decision.targetAccepted)
      return "Această țintă nu este permisă pentru categoria și caracteristicile alese.";
    if (!this.decision.policyAvailable)
      return "Ținta este permisă de constrângeri, dar nu există o regulă activă potrivită; API-ul ar refuza ruta cu NO_POLICY.";
    if (this.hypotheticalTarget === this.decision.destination)
      return "Ținta ipotetică coincide cu destinația selectată de regula activă.";
    return `Ținta este permisă de constrângeri, dar politica activă păstrează ruta către ${this.storageLabel(this.decision.destination)}. Playground-ul nu schimbă configurația.`;
  }

  measuredStorage(storage: string) { return this.categoryMetrics.some(metric => metric.storage === storage); }

  get hasMetrics() { return this.categoryMetrics.length > 0; }

  get hypotheticalBytes() {
    const size = Number(this.sizeMiB);
    return Number.isFinite(size) && size > 0 ? Math.round(size * 1024 * 1024) : 0;
  }

  storageLabel(storage: string | null | undefined) {
    return ({ DATABASE: "Database · PostgreSQL", S3: "Object storage · MinIO / S3", FTP: "FTP service" } as Record<string, string>)[storage || ""] || storage || "Nedeterminată";
  }

  formatBytes(bytes: number) {
    return this.vm.bytes(bytes);
  }
}
