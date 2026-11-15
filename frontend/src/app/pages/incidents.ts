import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { IncidentGroup } from "../api";
import { WorkspaceStore } from "../workspace";
import { SectionStateComponent } from "../section-state";
import { IncidentMapComponent } from "../incident-map";
@Component({
  selector: "filegrid-incidents", standalone: true,
  imports: [CommonModule, FormsModule, SectionStateComponent, IncidentMapComponent],
  templateUrl: "./incidents.html",
  host: { style: "display:block; min-width:0" },
})
export class IncidentsPage {
 readonly vm=inject(WorkspaceStore);
 showResolved=false;
 critical(group:IncidentGroup){return group.incidents.some(i=>i.safetyCritical || i.analysis?.recommendation==='IMMEDIATE_HUMAN_REVIEW');}
 visibleGroups(){return this.vm.visibleGroups().filter(g=>this.showResolved || g.status!=='RESOLVED');}
 analysis(group:IncidentGroup){return [...group.incidents].sort((a,b)=>Number(b.safetyCritical)-Number(a.safetyCritical)||(b.analysis?.priorityScore??0)-(a.analysis?.priorityScore??0)).find(i=>i.analysis)?.analysis;}
}
