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
export class UploadPage { readonly vm = inject(WorkspaceStore); }
