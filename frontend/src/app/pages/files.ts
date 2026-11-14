import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { WorkspaceStore } from "../workspace";
import { SectionStateComponent } from "../section-state";
@Component({
  selector: "filegrid-files", standalone: true,
  imports: [CommonModule, FormsModule, SectionStateComponent],
  templateUrl: "./files.html",
  host: { style: "display:block; min-width:0" },
})
export class FilesPage { readonly vm = inject(WorkspaceStore); }
