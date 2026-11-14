import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { WorkspaceStore } from "../workspace";
@Component({
  selector: "filegrid-upload", standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./upload.html",
  host: { style: "display:block; min-width:0" },
})
export class UploadPage {
 readonly vm = inject(WorkspaceStore);
 newIncident() {
  if(this.vm.busy() || this.vm.uploads.recovery() || this.vm.uploads.requestedResume()) return;
  this.vm.uploads.incidentId='';
  this.vm.uploads.stationId='';
  this.vm.uploads.safetyCritical=false;
  this.vm.focus('#station-id');
 }
 async submit() {
  const generation = this.vm.generation();
  if(this.vm.uploads.category === 'INCIDENT' && !this.vm.uploads.incidentId) await this.vm.uploads.createIncident();
  if(generation !== this.vm.generation()) return;
  if(this.vm.uploads.category === 'INCIDENT' && !this.vm.uploads.incidentId) return;
  if(this.vm.uploads.file) await this.vm.uploads.upload();
 }
}
