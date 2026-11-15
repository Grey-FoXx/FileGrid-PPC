import { Component, ElementRef, ViewChild, inject, signal } from "@angular/core";
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
    { key: "INCIDENT", label: "Avarii", note: "Alege Database, S3 sau FTP; regulile specifice au prioritate în ordinea afișată." },
    { key: "CONNECTION_DOCUMENT", label: "Documente de racordare", note: "Documente criptate înainte de stocare în oricare dintre cele trei destinații." },
    { key: "DRONE_VIDEO", label: "Videoclipuri dronă", note: "Transfer pe bucăți reluabil către Database, S3 sau FTP." },
  ];
  readonly storageTargets = [
    { key: "DATABASE", label: "Database · PostgreSQL" },
    { key: "S3", label: "Object storage · MinIO / S3" },
    { key: "FTP", label: "FTP service" },
  ];
  modalOpen = false;
  saving = signal(false);
  selectedRuleId = '';
  draftId = '';
  draftCategory = 'INCIDENT';
  draftStorage = 'S3';
  draftAttachmentType = '';
  draftSensitivity = '';
  error = signal('');
  applied = signal('');
  private baseConfig: PolicyConfiguration | null = null;

  get activeConfig(): PolicyConfiguration | null {
    const value = this.vm.policies() as Partial<PolicyConfiguration> | null;
    return value && Array.isArray(value.rules) ? value as PolicyConfiguration : null;
  }
  get activeRules(): PolicyRule[] {return this.activeConfig?.rules || [];}
  get policyVersion(){return this.activeConfig?.version ?? '—';}
  get isAdmin(){return this.vm.me()?.role === 'ADMIN';}
  label(category:string){return this.categories.find(c=>c.key===category)?.label || category;}
  storageLabel(storage:string){return this.storageTargets.find(s=>s.key===storage)?.label || storage;}
  rulesFor(category:string){return this.activeRules.filter(r=>r.category===category);}
  editableRules(){return this.baseConfig?.rules.filter(r=>r.category===this.draftCategory) || [];}

  newPolicy(category:string){
    if(!this.isAdmin || !this.activeConfig) return;
    this.baseConfig=structuredClone(this.activeConfig);
    this.draftCategory=category;this.onCategoryChanged();this.error.set('');this.applied.set('');this.modalOpen=true;
    setTimeout(()=>{const dialog=this.policyDialog?.nativeElement;if(dialog&&!dialog.open)dialog.showModal();});
  }
  onCategoryChanged(){
    this.selectedRuleId=this.editableRules()[0]?.id || '';
    this.selectRule();
  }
  selectRule(){
    const rule=this.editableRules().find(r=>r.id===this.selectedRuleId);
    this.draftId=rule?.id || '';this.draftStorage=rule?.storage || '';
    this.draftAttachmentType=rule?.attachmentType || '';this.draftSensitivity=rule?.sensitivity || '';
    this.error.set('');this.applied.set('');
  }
  closeModal(){
    if(this.saving())return;
    this.modalOpen=false;this.error.set('');
    if(this.policyDialog?.nativeElement.open)this.policyDialog.nativeElement.close();
  }
  private validate(){
    if(!this.baseConfig || !this.selectedRuleId)return 'Încarcă mai întâi politica activă.';
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(this.draftId.trim()))return 'ID-ul regulii trebuie să aibă 1–120 caractere: litere, cifre, punct, _ sau -.';
    if(this.baseConfig.rules.some(r=>r.id!==this.selectedRuleId && r.id===this.draftId.trim()))return 'ID-ul este folosit de altă regulă.';
    return '';
  }
  async confirmPolicy(){
    if(this.saving() || !this.isAdmin)return;
    this.error.set(this.validate());if(this.error())return;
    const rule:PolicyRule={id:this.draftId.trim(),category:this.draftCategory,storage:this.draftStorage};
    if(this.draftCategory==='INCIDENT'){
      if(this.draftAttachmentType)rule.attachmentType=this.draftAttachmentType;
      if(this.draftSensitivity)rule.sensitivity=this.draftSensitivity;
    }
    const rules=this.baseConfig!.rules.map(r=>r.id===this.selectedRuleId?rule:r);
    await this.apply('/policies',{expectedVersion:this.baseConfig!.version,rules},rule.id);
  }
  async restoreOriginalConfig(){
    if(this.saving() || !this.isAdmin || !this.baseConfig)return;
    await this.apply('/policies/reset',{expectedVersion:this.baseConfig.version},'');
  }
  private async apply(path:string,body:object,ruleId:string){
    const generation=this.vm.generation();this.saving.set(true);this.error.set('');this.applied.set('');
    try{
      const config=await this.vm.api.request<PolicyConfiguration>(path,{method:path.endsWith('/reset')?'POST':'PUT',body:JSON.stringify(body)});
      if(generation!==this.vm.generation())return;
      this.vm.policies.set(config);this.baseConfig=structuredClone(config);
      this.selectedRuleId=ruleId || this.editableRules()[0]?.id || '';
      this.selectRule();
      this.applied.set('Politica v'+config.version+' este activă. Se aplică sesiunilor noi; fișierele și transferurile deja create își păstrează destinația și versiunea.');
    }catch(e){if(generation===this.vm.generation())this.error.set(this.vm.problemMessage(e));}
    finally{if(generation===this.vm.generation())this.saving.set(false);}
  }
  async reloadDraft(){
    if(this.saving())return;
    await this.vm.refresh();
    if(this.activeConfig){this.baseConfig=structuredClone(this.activeConfig);this.onCategoryChanged();}
  }
}
