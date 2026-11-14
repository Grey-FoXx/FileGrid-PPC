import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { FileRecord } from "../api";
import { WorkspaceStore } from "../workspace";
import { SectionStateComponent } from "../section-state";
@Component({
  selector: "filegrid-files", standalone: true,
  imports: [CommonModule, FormsModule, SectionStateComponent],
  templateUrl: "./files.html",
  host: { style: "display:block; min-width:0" },
})
export class FilesPage {
 readonly vm = inject(WorkspaceStore);
 unmeasured(){return this.vm.fileCategories().flatMap(category=>['DATABASE','S3','FTP'].filter(storage=>!this.vm.series().some(s=>s.category===category && s.storage===storage)).map(storage=>({category,storage})));}
 journeyCategory = this.vm.fileCategories()[0] || 'INCIDENT'; journeyId = ''; replay = 0;
 candidates(){return this.vm.files().filter(f=>f.category===this.journeyCategory);}
 file(): FileRecord | undefined {return this.candidates().find(f=>f.id===this.journeyId) || this.candidates()[0];}
 steps(){
 const f=this.file();
 return [
 {label:this.journeyCategory === 'METER_READING' ? 'Citire simulată' : 'Creare fișier',detail:f ? f.createdAt : 'Alege un fișier din pagina curentă',known:!!f},
 {label:'Cerere FileGrid',detail:'Autentificare · ID de corelare',known:this.traces().length>0},
 {label:'Policy Engine',detail:f ? 'Politica v'+f.policyVersion+' · '+f.routingReason : 'Decizia reală apare în metadatele fișierului',known:!!f},
 {label:this.journeyCategory === 'DRONE_VIDEO' ? 'Transfer multipart' : this.journeyCategory === 'CONNECTION_DOCUMENT' ? 'Criptare înainte de storage' : 'Transfer durabil',detail:this.journeyCategory === 'DRONE_VIDEO' ? 'Bucăți de 8 MiB · reluare' : this.journeyCategory === 'CONNECTION_DOCUMENT' ? 'AES-256-GCM' : 'Prin API, fără acces direct la storage',known:!!f && ['UPLOADED','VERIFYING','AVAILABLE'].includes(f.status)},
 {label:f?.storage || 'Storage',detail:f ? 'Stare: '+f.status : 'Destinație indisponibilă',known:f?.status==='AVAILABLE'},
 {label:'Integritate',detail:f?.integrityStatus || 'Not measured',known:f?.integrityStatus==='VERIFIED'},
 {label:'Disponibil',detail:f?.category==='INCIDENT' ? 'Analiza ML este asincronă și independentă' : 'Recuperare și verificare SHA-256',known:f?.status==='AVAILABLE'}];
 }
 traces(){const id=this.file()?.id;return id ? this.vm.api.traces().filter(t=>t.fileId===id) : [];}
}
