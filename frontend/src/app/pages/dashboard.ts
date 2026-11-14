import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { WorkspaceStore } from "../workspace";
import { SectionStateComponent } from "../section-state";
@Component({
  selector: "filegrid-dashboard", standalone: true,
  imports: [CommonModule, FormsModule, SectionStateComponent],
  templateUrl: "./dashboard.html",
  host: { style: "display:block; min-width:0" },
})
export class DashboardPage { readonly vm = inject(WorkspaceStore); }
