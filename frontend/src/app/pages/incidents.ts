import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { WorkspaceStore } from "../workspace";
import { SectionStateComponent } from "../section-state";
import { IncidentMapComponent } from "../incident-map";
@Component({
  selector: "filegrid-incidents", standalone: true,
  imports: [CommonModule, FormsModule, SectionStateComponent, IncidentMapComponent],
  templateUrl: "./incidents.html",
  host: { style: "display:block; min-width:0" },
})
export class IncidentsPage { readonly vm = inject(WorkspaceStore); }
