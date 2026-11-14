import { Component, ElementRef, ViewChild, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { WorkspaceStore } from "../workspace";
import { SectionStateComponent } from "../section-state";

interface PolicyRule { id: string; category: string; storage: string; attachmentType?: string; sensitivity?: string; }
interface PolicyConfiguration { version: number | string; rules: PolicyRule[]; [key: string]: unknown; }
@Component({
  selector: "filegrid-policies", standalone: true,
  imports: [CommonModule, FormsModule, SectionStateComponent],
  templateUrl: "./policies.html", host: { style: "display:block; min-width:0" },
  styles: [`
    .category-picker { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr)); gap:14px; }
    .category-card { min-width:0; border:1px solid #dce5f1; border-radius:12px; padding:17px; background:#fff; }
    .category-card h3,.category-card p,.category-card small { overflow-wrap:anywhere; }
    .category-card h3 { margin:0 0 8px; }
    .category-card .secondary { margin-top:10px; }
    .policy-summary { display:flex; justify-content:space-between; gap:12px; align-items:start; padding:11px 0; border-top:1px solid #e8edf5; }
    .policy-summary span { overflow-wrap:anywhere; }
    .policy-modal { width:min(680px,calc(100% - 24px)); max-width:none; max-height:min(90vh,900px); overflow:auto; margin:auto; background:#fff; border:1px solid #d8e2f0; border-radius:24px; box-shadow:0 24px 80px rgba(17,35,69,.28); padding:clamp(18px,4vw,30px); color:#17243a; }
    .policy-modal::backdrop { background:rgba(12,24,44,.48); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
    .modal-heading { display:flex; align-items:start; justify-content:space-between; gap:16px; margin-bottom:15px; }
    .modal-heading h2 { margin:0; }
    .modal-close { min-width:44px; min-height:44px; border:1px solid #d7e1ee; border-radius:9px; color:#244b91; background:white; font-size:23px; }
    .policy-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 14px; }
    .policy-form label { min-width:0; }
    .policy-actions { display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end; margin-top:18px; }
    .form-error { color:#8a301b; background:#fff0e9; border:1px solid #f0c9bb; padding:11px 13px; border-radius:6px; }
    .generated-config { max-height:260px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; background:#f3f6fb; border:1px solid #dce5f1; border-radius:10px; padding:13px; font-size:12px; }
    .setup-note { border-left:4px solid #4674c2; background:#f1f5fc; padding:13px 15px; overflow-wrap:anywhere; }
    .guard-note { color:#435673; }
    @media (max-width:580px) { .policy-form { grid-template-columns:1fr; } .policy-actions > * { flex:1 1 100%; } .policy-modal { width:calc(100% - 20px); } }
    @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation:none!important; transition:none!important; } }
  `],
})
export class PoliciesPage {
  @ViewChild("policyDialog") private policyDialog?: ElementRef<HTMLDialogElement>;
  readonly vm = inject(WorkspaceStore);
  readonly categories = [
    { key: "METER_READING", label: "Citiri contoare", note: "Ingestie automată, identitate unică și confirmare după commit." },
    { key: "INCIDENT", label: "Avarii", note: "S3 pentru atașamente obișnuite; FTP este permis doar pentru loguri legacy nesensibile." },
    { key: "CONNECTION_DOCUMENT", label: "Documente de racordare", note: "Documente private criptate înainte de stocare." },
    { key: "DRONE_VIDEO", label: "Videoclipuri dronă", note: "Object storage cu sesiuni multipart reluabile." },
  ];
  readonly storageTargets = [
    { key: "DATABASE", label: "Database · PostgreSQL" },
    { key: "S3", label: "Object storage · MinIO / S3" },
    { key: "FTP", label: "FTP service" },
  ];
  modalOpen = false;
  draftVersion = 1;
  draftId = "";
  draftCategory = "INCIDENT";
  draftStorage = "S3";
  draftAttachmentType = "";
  draftSensitivity = "";
  error = "";
  generatedConfig = "";
  generatedKind: "new" | "restore" = "new";

  get activeConfig(): PolicyConfiguration | null {
    const value = this.vm.policies() as Partial<PolicyConfiguration> | null;
    return value && Array.isArray(value.rules) ? value as PolicyConfiguration : null;
  }
  get activeRules(): PolicyRule[] { return this.activeConfig?.rules || []; }
  get policyVersion() { return this.activeConfig?.version ?? "—"; }
  get isAdmin() { return this.vm.me()?.role === "ADMIN"; }
  label(category: string) { return this.categories.find(item => item.key === category)?.label || category; }
  storageLabel(storage: string) { return this.storageTargets.find(item => item.key === storage)?.label || storage; }
  rulesFor(category: string) { return this.activeRules.filter(rule => rule.category === category); }

  newPolicy(category: string) {
    const version = Number(this.policyVersion);
    this.draftVersion = Number.isFinite(version) ? version + 1 : 1;
    this.draftCategory = category;
    const originalRule = this.activeRules.find(rule => rule.category === category);
    this.draftStorage = originalRule?.storage || (category === "METER_READING" ? "DATABASE" : "S3");
    this.draftAttachmentType = originalRule?.attachmentType || "";
    this.draftSensitivity = originalRule?.sensitivity || "";
    this.draftId = this.uniqueId(category);
    this.error = "";
    this.generatedConfig = "";
    this.generatedKind = "new";
    this.modalOpen = true;
    setTimeout(() => {
      const dialog = this.policyDialog?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }
  private uniqueId(category: string) {
    const base = "rule-" + category.toLocaleLowerCase("en-US").replaceAll("_", "-");
    const existing = new Set(this.activeRules.map(rule => rule.id));
    if (!existing.has(base)) return base;
    let suffix = 2;
    while (existing.has(`${base}-${suffix}`)) suffix++;
    return `${base}-${suffix}`;
  }
  closeModal() {
    this.modalOpen = false;
    this.error = "";
    if (this.policyDialog?.nativeElement.open) this.policyDialog.nativeElement.close();
  }
  onCategoryChanged() {
    const originalRule = this.activeRules.find(rule => rule.category === this.draftCategory);
    this.draftStorage = originalRule?.storage || (this.draftCategory === "METER_READING" ? "DATABASE" : "S3");
    this.draftAttachmentType = originalRule?.attachmentType || "";
    this.draftSensitivity = originalRule?.sensitivity || "";
    this.draftId = this.uniqueId(this.draftCategory);
  }
  private validate(): string {
    if (!this.activeConfig) return "Configurația activă nu a fost încărcată. Reîncarcă politicile înainte de generare.";
    if (!Number.isInteger(Number(this.draftVersion)) || Number(this.draftVersion) <= Number(this.policyVersion)) return "Versiunea nouă trebuie să fie un număr întreg mai mare decât versiunea activă.";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(this.draftId.trim())) return "ID-ul regulii trebuie să aibă 1–80 caractere: litere, cifre, punct, _ sau -.";
    if (this.activeRules.some(rule => rule.id === this.draftId.trim())) return "ID-ul regulii există deja în configurația activă.";
    if (this.draftCategory === "METER_READING" && this.draftStorage !== "DATABASE") return "Citirile de contor trebuie rutate către DATABASE.";
    if (["CONNECTION_DOCUMENT", "DRONE_VIDEO"].includes(this.draftCategory) && this.draftStorage !== "S3") return "Documentele de racordare și videoclipurile dronă trebuie rutate către S3.";
    if (this.draftCategory === "INCIDENT" && !["S3", "FTP"].includes(this.draftStorage)) return "Avariile pot fi rutate doar către S3 sau FTP.";
    if (this.draftCategory === "INCIDENT" && this.draftStorage === "FTP" && (this.draftAttachmentType !== "LEGACY_LOG" || this.draftSensitivity !== "NON_SENSITIVE")) return "FTP este permis numai pentru LEGACY_LOG cu sensibilitate NON_SENSITIVE.";
    return "";
  }
  confirmPolicy() {
    this.error = this.validate();
    if (this.error) return;
    const active = this.activeConfig!;
    const rule: PolicyRule = { id: this.draftId.trim(), category: this.draftCategory, storage: this.draftStorage };
    if (this.draftCategory === "INCIDENT") {
      if (this.draftAttachmentType) rule.attachmentType = this.draftAttachmentType;
      if (this.draftSensitivity) rule.sensitivity = this.draftSensitivity;
    }
    const rules = [...active.rules];
    const firstCategoryRule = rules.findIndex(existing => existing.category === rule.category);
    rules.splice(firstCategoryRule < 0 ? rules.length : firstCategoryRule, 0, rule);
    const config = { ...active, version: Number(this.draftVersion), rules };
    this.generatedConfig = JSON.stringify(config, null, 2) + "\n";
    this.generatedKind = "new";
    this.error = "";
    this.downloadConfig(this.generatedConfig);
  }
  restoreOriginalConfig() {
    if (!this.activeConfig) return;
    this.generatedConfig = "";
    this.error = "";
    const firstRule = this.activeRules[0];
    if (firstRule) {
      this.draftCategory = firstRule.category;
      this.draftStorage = firstRule.storage;
      this.draftAttachmentType = firstRule.attachmentType || "";
      this.draftSensitivity = firstRule.sensitivity || "";
      this.draftId = this.uniqueId(firstRule.category);
    }
    const version = Number(this.policyVersion);
    this.draftVersion = Number.isFinite(version) ? version + 1 : 1;
    this.generatedConfig = JSON.stringify(this.activeConfig, null, 2) + "\n";
    this.generatedKind = "restore";
    this.downloadConfig(this.generatedConfig);
  }
  downloadConfig(content: string) {
    const blob = new Blob([content], { type: "application/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "storage-policies.yaml";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  get restartCommand() { return "docker compose restart api"; }
}
