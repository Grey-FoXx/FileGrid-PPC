import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { WorkspaceStore } from "./workspace";
import { DashboardPage } from "./pages/dashboard";
import { UploadPage } from "./pages/upload";
import { FilesPage } from "./pages/files";
import { IncidentsPage } from "./pages/incidents";
import { MetersPage } from "./pages/meters";
import { PoliciesPage } from "./pages/policies";
@Component({
  selector: "app-root", standalone: true,
  imports: [CommonModule, FormsModule, DashboardPage, UploadPage, FilesPage, IncidentsPage, MetersPage, PoliciesPage],
  providers: [WorkspaceStore],
  templateUrl: "./app.html",
})
export class AppComponent { readonly vm = inject(WorkspaceStore); }
