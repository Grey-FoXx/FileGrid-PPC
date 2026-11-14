import { Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Incident } from './api';
import { ROMANIA_OUTLINE } from './romania-outline';
interface Marker { id: string; x: number; y: number; severity: number; rows: Incident[]; }
@Component({
 selector: 'filegrid-incident-map', standalone: true, imports: [CommonModule],
 template: `
 <section class="panel map-panel" aria-label="Harta avariilor din România">
 <div class="panel-heading"><div><span class="eyebrow">REȚEAUA DIN TEREN</span><h2>România · avarii în timp real</h2></div><span class="badge">{{ rows().length }} rapoarte în pagina curentă</span></div>
 <div class="map-layout"><svg viewBox="0 0 720 560" aria-label="Hartă interactivă România" role="group">
 <defs><clipPath id="romania-clip"><path [attr.d]="outline" /></clipPath><linearGradient id="country-fill" x2="1" y2="1"><stop stop-color="#f5f8ff"/><stop offset="1" stop-color="#dbe6ff"/></linearGradient></defs>
 <path [attr.d]="outline" fill="url(#country-fill)" stroke="#7594cf" stroke-width="2"/>
 <g clip-path="url(#romania-clip)" class="region-highlights">
 <ellipse cx="118" cy="326" rx="90" ry="100"/><ellipse cx="402" cy="422" rx="133" ry="68"/><ellipse cx="604" cy="364" rx="57" ry="112"/>
 </g>
 <g class="region-labels"><text x="78" y="287">BANAT</text><text x="350" y="463">MUNTENIA</text><text x="560" y="333">DOBROGEA</text><text x="300" y="208" class="country-label">ROMÂNIA</text></g>
 @for (m of markers(); track m.id) {
 <g role="button" tabindex="0" [attr.aria-label]="label(m)" (click)="selected.set(m.id)" (keydown.enter)="selected.set(m.id)" (keydown.space)="$event.preventDefault(); selected.set(m.id)" [attr.transform]="'translate('+m.x+' '+m.y+')'" class="map-marker" [class.chosen]="selected() === m.id">
 <circle class="halo" [attr.r]="m.rows.length > 1 ? 24 : 18" [attr.fill]="color(m.severity)"/>
 <g class="arrival"><circle [attr.r]="m.rows.length > 1 ? 16 : 9" [attr.fill]="color(m.severity)" stroke="white" stroke-width="3"/>
 @if (m.rows.length > 1) {<text text-anchor="middle" y="5" fill="white">{{m.rows.length}}</text>}</g><title>{{label(m)}}</title></g>
 }
 </svg><aside class="map-info">
 <h3>Semnale din teren</h3><p><span class="severity-dot yellow"></span> Severitate 1–2</p><p><span class="severity-dot orange"></span> Severitate 3</p><p><span class="severity-dot red"></span> Severitate 4–5</p>
 @if (selection(); as m) {
 <h3>{{m.rows.length > 1 ? 'Grup de proximitate' : 'Raport selectat'}}</h3>
 @for (i of m.rows; track i.id) {<p><strong>{{i.stationId}}</strong><br>{{i.eventType}} · {{i.zone}}<br>Severitate {{i.severity}} · ML {{i.mlStatus}}</p>}
 @if(m.rows.length > 1) {<p class="callout">Rapoarte apropiate, de același tip, în cel mult 30 minute și 8 km. Cauza comună necesită confirmare; grupul vizual nu înlocuiește Modelul 2.</p>}
 } @else {<p>Selectează o bulină sau un cluster pentru detalii.</p>}
 <small>{{missing()}} rapoarte fără coordonate valide pentru România; sunt păstrate în lista de mai jos.</small>
 </aside></div>
 <p class="footnote">Actualizare API la 5 secunde · pagina curentă, nu întreaga rețea. Contur: Natural Earth, domeniu public. Evidențierile celor trei regiuni sunt orientative. Etichetele locale ML nu demonstrează apartenența la aceeași defecțiune.</p>
 </section>`,
 styles: [`svg{width:100%;max-height:500px;display:block}.map-layout{display:grid;grid-template-columns:minmax(0,3fr) minmax(190px,1fr);gap:24px}.map-info{padding:24px;background:#f5f8ff;border-radius:22px;overflow-wrap:anywhere}.region-highlights ellipse{fill:#3261ff;opacity:.18;stroke:#325fe0;stroke-width:2;stroke-dasharray:5 5}.region-labels{fill:#3e5b96;font-size:13px;font-weight:700;letter-spacing:1.5px}.country-label{fill:#a9bbde;letter-spacing:5px;font-size:22px}.map-marker{cursor:pointer;outline:none}.halo{opacity:.16}.chosen .halo,.map-marker:focus .halo{opacity:.45;stroke:#142e6c;stroke-width:3}.arrival{animation:arrive .85s ease-out both}.map-marker text{font-size:13px;font-weight:700}.severity-dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:8px}.yellow{background:#d7a400}.orange{background:#ed861e}.red{background:#d63546}@keyframes arrive{from{transform:translateY(-45px);opacity:0}to{transform:translateY(0);opacity:1}}@media(max-width:800px){.map-layout{grid-template-columns:1fr}.map-info{padding:16px}}@media(prefers-reduced-motion:reduce){.arrival{animation:none}}`]
})
export class IncidentMapComponent {
 readonly rows = input<Incident[]>([]); readonly outline = ROMANIA_OUTLINE; readonly selected = signal('');
 private valid(i: Incident) {return typeof i.latitude === 'number' && typeof i.longitude === 'number' && i.latitude >= 43.5 && i.latitude <=48.4 && i.longitude >=20.1 && i.longitude <=29.8;}
 readonly missing = computed(() => this.rows().filter(i=>!this.valid(i)).length);
 readonly markers = computed(() => {
  const groups: Marker[]=[];
  for(const i of this.rows().filter(i=>this.valid(i))) {
   const x=(i.longitude!-20)*70, y=(48.6-i.latitude!)*100;
   const t=Date.parse(i.occurredAt || i.createdAt || '');
   const group=groups.find(g=>g.rows.every(r=>{
    const rt=Date.parse(r.occurredAt || r.createdAt || '');
    const km=Math.hypot((r.longitude!-i.longitude!)*77,(r.latitude!-i.latitude!)*111);
    return r.eventType===i.eventType && Number.isFinite(t) && Number.isFinite(rt) && Math.abs(t-rt)<=1800000 && km<=8;
   }));
   if(group){group.rows.push(i);group.severity=Math.max(group.severity,i.severity);group.x=group.rows.reduce((s,r)=>s+(r.longitude!-20)*70,0)/group.rows.length;group.y=group.rows.reduce((s,r)=>s+(48.6-r.latitude!)*100,0)/group.rows.length;}
   else groups.push({id:i.id,x,y,severity:i.severity,rows:[i]});
  }
  return groups;
 });
 readonly selection=computed(()=>this.markers().find(m=>m.id===this.selected()));
 color(s:number){return s>=4?'#d63546':s===3?'#ed861e':'#d7a400';}
 label(m:Marker){return `${m.rows.length} rapoarte, severitate ${m.severity}, ${m.rows[0].zone}`;}
}
