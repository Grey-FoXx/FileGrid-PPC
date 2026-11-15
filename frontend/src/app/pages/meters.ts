import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { WorkspaceStore } from "../workspace";
import { SectionStateComponent } from "../section-state";
@Component({
  selector: "filegrid-meters", standalone: true,
  imports: [CommonModule, FormsModule, SectionStateComponent],
  templateUrl: "./meters.html",
  host: { style: "display:block; min-width:0" },
})
export class MetersPage { readonly vm = inject(WorkspaceStore); }
