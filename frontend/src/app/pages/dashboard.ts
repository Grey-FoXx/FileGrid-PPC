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
export class DashboardPage {
 readonly vm = inject(WorkspaceStore);
 risks() {
  const risks:string[]=[];
  if(this.vm.series().some(s=>s.errorRate>0)) risks.push('API-ul raportează operații cu erori. Verifică durabilitatea și disponibilitatea categoriilor afectate.');
  if(this.vm.files().some(f=>['CORRUPTED','FAILED','RETRY_PENDING'].includes(f.status))) risks.push('Există fișiere cu probleme în pagina curentă. Integritatea sau disponibilitatea necesită verificare.');
  if(Object.values(this.vm.states()).some(s=>!!s.error)) risks.push('O sursă de date este indisponibilă; observabilitatea este incompletă.');
  return risks;
 }
}
