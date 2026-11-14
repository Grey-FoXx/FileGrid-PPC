import { Component, inject, signal, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { FileRecord, Page } from "../api";
import { WorkspaceStore } from "../workspace";
import { SectionStateComponent } from "../section-state";
@Component({
  selector: "filegrid-files", standalone: true,
  imports: [CommonModule, FormsModule, SectionStateComponent],
  templateUrl: "./files.html", host: { style: "display:block; min-width:0" },
})
export class FilesPage implements OnInit, OnDestroy {
 readonly vm = inject(WorkspaceStore);
 readonly journeyFiles = signal<FileRecord[]>([]);
 readonly journeyLoading = signal(false);
 readonly journeyError = signal('');
 readonly journeyTotal = signal(0);
 journeyCategory = this.vm.fileCategories()[0] || 'INCIDENT';
 journeyId = ''; journeyPage = 0; replay = 0;
 private request: AbortController | null = null;
 ngOnInit(){void this.loadJourney();}
 ngOnDestroy(){this.request?.abort();}
 async loadJourney(reset = false){
  if(reset){this.journeyPage=0;this.journeyId='';this.journeyFiles.set([]);this.replay++;}
  this.request?.abort(); const request = new AbortController(); this.request=request;
  const generation=this.vm.generation();this.journeyLoading.set(true);this.journeyError.set('');
  try {
   const query=new URLSearchParams({category:this.journeyCategory,page:String(this.journeyPage),size:'25'});
   const result=await this.vm.api.request<Page<FileRecord>>('/files?'+query,{signal:request.signal});
   if(request.signal.aborted || generation!==this.vm.generation()) return;
   this.journeyFiles.set(result.items.filter(f=>f.category===this.journeyCategory));this.journeyTotal.set(result.total);
   if(!this.journeyFiles().some(f=>f.id===this.journeyId)) this.journeyId=this.journeyFiles()[0]?.id || '';
  }catch(e){if(!request.signal.aborted && generation===this.vm.generation()) this.journeyError.set(this.vm.problemMessage(e));}
  finally{if(!request.signal.aborted)this.journeyLoading.set(false);}
 }
 async pageJourney(delta:number){this.journeyPage=Math.max(0,this.journeyPage+delta);await this.loadJourney();}
 unmeasured(){return this.vm.fileCategories().flatMap(category=>['DATABASE','S3','FTP'].filter(storage=>!this.vm.series().some(s=>s.category===category && s.storage===storage)).map(storage=>({category,storage})));}
 candidates(){return this.journeyFiles();}
 file():FileRecord|undefined{return this.candidates().find(f=>f.id===this.journeyId);}
 steps(){
  const f=this.file();
  return [
   {label:this.journeyCategory==='METER_READING'?'Citire de contor':'Fișier sursă',detail:f?f.filename+' · '+this.vm.bytes(f.sizeBytes):'Niciun fișier selectat',known:!!f},
   {label:'Cerere FileGrid',detail:f?'Fișier înregistrat: '+f.createdAt:'Metadatele vor apărea după încărcare',known:!!f},
   {label:'Policy Engine',detail:f?'Politica v'+f.policyVersion+' · '+f.routingReason:'Decizia reală apare în metadatele fișierului',known:!!f},
   {label:this.journeyCategory==='DRONE_VIDEO'?'Transfer multipart':this.journeyCategory==='CONNECTION_DOCUMENT'?'Criptare înainte de storage':'Transfer durabil',detail:this.journeyCategory==='DRONE_VIDEO'?'Bucăți de 8 MiB · reluare':this.journeyCategory==='CONNECTION_DOCUMENT'?'AES-256-GCM':'Prin API, fără acces direct la storage',known:!!f&&['UPLOADED','VERIFYING','AVAILABLE'].includes(f.status)},
   {label:f?.storage||'Storage',detail:f?'Stare: '+f.status:'Destinație indisponibilă',known:f?.status==='AVAILABLE'},
   {label:'Integritate',detail:f?.integrityStatus||'Indisponibil',known:f?.integrityStatus==='VERIFIED'},
   {label:'Disponibil',detail:f?.category==='INCIDENT'?'Analiza ML este asincronă și independentă':'Recuperare și verificare SHA-256',known:f?.status==='AVAILABLE'}
  ];
 }
 traces(){const id=this.file()?.id;return id?this.vm.api.traces().filter(t=>t.fileId===id):[];}
}
