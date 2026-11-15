import { Component, computed, input, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Incident } from './api';
import { ROMANIA_OUTLINE } from './romania-outline';
import { MapMarker as Marker, groupMarkers, separateMarkers, located, project } from './incident-map-layout';
interface Arrival {id:string; groupId:string; x:number; y:number; sourceX:number; sourceY:number; targetX:number; targetY:number; severity:number;}
@Component({
 selector: 'filegrid-incident-map', standalone: true, imports: [CommonModule],
 template: `
 <section class="panel map-panel" aria-label="Harta avariilor din România">
 <div class="panel-heading"><div><span class="eyebrow">REȚEAUA DIN TEREN</span><h2>România · avarii în timp real</h2></div><span class="badge">{{ rows().length }} rapoarte {{ persistent() ? "deschise" : "în pagina curentă" }}</span></div>
 <div class="map-layout"><svg viewBox="0 0 720 560" aria-label="Hartă interactivă România" role="group">
 <defs><clipPath id="romania-clip"><path [attr.d]="outline" /></clipPath><linearGradient id="country-fill" x2="1" y2="1"><stop stop-color="#f5f8ff"/><stop offset="1" stop-color="#dbe6ff"/></linearGradient></defs>
 <path [attr.d]="outline" fill="url(#country-fill)" stroke="#7594cf" stroke-width="2"/>
 <g clip-path="url(#romania-clip)" class="region-highlights">
 <ellipse cx="118" cy="326" rx="90" ry="100"/><ellipse cx="402" cy="422" rx="133" ry="68"/><ellipse cx="604" cy="364" rx="57" ry="112"/>
 </g>
 <g class="region-labels"><text x="78" y="287">BANAT</text><text x="350" y="463">MUNTENIA</text><text x="560" y="333">DOBROGEA</text><text x="300" y="208" class="country-label">ROMÂNIA</text></g>
 <g clip-path="url(#romania-clip)">
 @for(m of markers();track m.id){
 @if(Math.hypot(m.x-m.anchorX,m.y-m.anchorY)>1){<line class="position-link" [attr.x1]="m.anchorX" [attr.y1]="m.anchorY" [attr.x2]="m.x" [attr.y2]="m.y"/><circle [attr.cx]="m.anchorX" [attr.cy]="m.anchorY" r="3" fill="#455f91"/>}
 <g role="button" tabindex="0" [attr.data-group-id]="m.id" [attr.data-group-count]="m.groupIds.length" [attr.data-source-x]="m.anchorX" [attr.data-source-y]="m.anchorY" [attr.aria-label]="label(m)" [attr.aria-pressed]="selected()===m.id" (click)="selected.set(m.id)" (keydown.enter)="selected.set(m.id)" (keydown.space)="$event.preventDefault(); selected.set(m.id)" [attr.transform]="'translate('+m.x+' '+m.y+')'" class="map-marker" [class.chosen]="selected()===m.id">
 <circle class="halo" [attr.r]="m.rows.length>1?30:18" [attr.fill]="color(m.severity)"/>
 @for(change of [m.id+':'+m.rows.length];track change){<g class="cluster-core"><circle [attr.r]="m.rows.length>1?16+Math.min(m.rows.length,16)/2:9" [attr.fill]="color(m.severity)" stroke="white" stroke-width="3"/>
 @if(m.rows.length>1){<text text-anchor="middle" y="5" fill="white">{{m.rows.length}}</text>}</g>}
 <title>{{label(m)}} · {{m.rows[0].eventType}}</title></g>
 }
 @for(a of arrivals();track a.id){
 <g class="report-arrival" [attr.data-report-id]="a.id" [attr.data-target-group-id]="a.groupId" [style.--from-x]="a.x+'px'" [style.--from-y]="a.y+'px'" [style.--to-x]="a.targetX+'px'" [style.--to-y]="a.targetY+'px'" aria-hidden="true"><circle r="6" [attr.fill]="color(a.severity)" stroke="white" stroke-width="2"/></g>
 }
 </g>
 </svg><aside class="map-info">
 <h3>Semnale din teren</h3><p><span class="severity-dot yellow"></span> Severitate 1–2</p><p><span class="severity-dot orange"></span> Severitate 3</p><p><span class="severity-dot red"></span> Severitate 4–5</p>
 @if (selection(); as m) {
 <h3>{{m.groupIds.length>1 ? 'Zonă aglomerată' : m.rows[0].groupId ? 'Grup de intervenție' : m.rows.length > 1 ? 'Grup de proximitate' : 'Raport selectat'}}</h3>
 @if(m.groupIds.length>1){<p class="callout">{{m.rows.length}} rapoarte · {{m.groupIds.length}} intervenții distincte. Agregare doar pe hartă; statusurile grupurilor rămân separate.</p><label>Intervenție din zonă<select aria-label="Intervenție din zonă" [value]="detailId()" (change)="detailGroup.set($any($event.target).value)">@for(group of detailGroups();track group.id){<option [value]="group.id">{{group.eventType}} · {{group.count}} rapoarte · {{group.id.slice(0,8)}}</option>}</select></label>}

 @if(detailRows()[0]?.interventionStatus){<p class="badge">{{detailRows()[0]?.interventionStatus === 'NEW' ? 'Nouă' : 'Echipaj trimis'}}</p>}
 @for (i of detailRows(); track i.id) {<p><strong>{{i.stationId}}</strong><br>{{i.eventType}} · {{i.zone}}<br>Severitate {{i.severity}} · ML {{i.mlStatus}}<br><small>GPS {{i.latitude ?? '—'}}, {{i.longitude ?? '—'}}</small></p>}
 @if(m.rows[0].groupId){<p class="callout">Rapoarte reunite în backend într-un singur grup. Acțiunile de sub hartă se aplică întregii intervenții.</p>}
 @else if(m.rows.length > 1) {<p class="callout">Rapoarte apropiate, de același tip, în cel mult 30 minute și 8 km. Cauza comună necesită confirmare; grupul vizual nu înlocuiește Modelul 2.</p>}
 } @else {<p>Selectează o bulină sau un cluster pentru detalii.</p>}
 <small>{{missing()}} rapoarte fără coordonate valide pentru România; sunt păstrate în lista de mai jos.</small>
 @if(unplaced()){<p class="callout">{{unplaced()}} rapoarte de margine nu au loc pentru un marcaj local sigur; rămân accesibile în lista de intervenții.</p>}
 </aside></div>
 <p class="footnote">Actualizare API automată · {{persistent() ? "grupuri deschise accesibile din setul de date ales" : "pagina curentă, nu întreaga rețea"}}. Contur: Natural Earth, domeniu public. Evidențierile celor trei regiuni sunt orientative. Etichetele locale ML nu demonstrează apartenența la aceeași defecțiune.</p>
 <p class="footnote">Bulinele suprapuse sunt decalate doar pentru lizibilitate; liniile indică centrul coordonatelor reale. Animația reunește vizual rapoartele în grupul primit din API. La densitate mare, o bulină poate totaliza mai multe intervenții distincte: selecteaz-o pentru a le vedea separat. Deplasarea vizuală rămâne locală.</p>
 </section>`,
 styles: [`svg{width:100%;max-height:500px;display:block}.map-layout{display:grid;grid-template-columns:minmax(0,3fr) minmax(190px,1fr);gap:24px}.map-info{max-height:500px;overflow-y:auto;padding:24px;background:#f5f8ff;border-radius:22px;overflow-wrap:anywhere}.region-highlights ellipse{fill:#3261ff;opacity:.18;stroke:#325fe0;stroke-width:2;stroke-dasharray:5 5}.region-labels{fill:#3e5b96;font-size:13px;font-weight:700;letter-spacing:1.5px}.country-label{fill:#a9bbde;letter-spacing:5px;font-size:22px}.map-marker{cursor:pointer;outline:none}.halo{opacity:.16}.chosen .halo,.map-marker:focus .halo{opacity:.45;stroke:#142e6c;stroke-width:3}.position-link{stroke:#8096bc;stroke-width:1.5;stroke-dasharray:4 4;pointer-events:none}.cluster-core{animation:cluster-pop .3s ease-out;transform-origin:0 0}.report-arrival{pointer-events:none;animation:join-group 1.6s ease-in-out both}.map-marker text{font-size:13px;font-weight:700}.severity-dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:8px}.yellow{background:#d7a400}.orange{background:#ed861e}.red{background:#d63546}@keyframes cluster-pop{from{transform:scale(.85)}to{transform:scale(1)}}@keyframes join-group{0%{transform:translate(var(--from-x),var(--from-y));opacity:0}15%{opacity:1}80%{transform:translate(var(--to-x),var(--to-y));opacity:1}100%{transform:translate(var(--to-x),var(--to-y));opacity:0}}@media(max-width:800px){.map-layout{grid-template-columns:1fr}.map-info{padding:16px}}@media(prefers-reduced-motion:reduce){.report-arrival{display:none;animation:none}.cluster-core{animation:none}}`]
})
export class IncidentMapComponent implements OnDestroy {
 readonly Math=Math;
 readonly rows=input<Incident[]>([]);
 readonly outline=ROMANIA_OUTLINE;
 readonly selected=signal('');
 readonly detailGroup=signal('');
 readonly arrivals=signal<Arrival[]>([]);
 private positions=new Map<string,Marker>();
 private seen=new Map<string,{groupId:string;x:number;y:number}>();
 private timers=new Set<ReturnType<typeof setTimeout>>();
 readonly persistent=computed(()=>this.rows().some(i=>!!i.groupId));
 readonly missing=computed(()=>this.rows().filter(i=>!located(i)).length);
 readonly markers=computed(()=>separateMarkers(groupMarkers(this.rows()),this.positions));
 readonly unplaced=computed(()=>{
  const represented=new Set(this.markers().flatMap(m=>m.rows.map(i=>i.id)));
  return this.rows().filter(i=>located(i)&&!represented.has(i.id)).length;
 });
 readonly selection=computed(()=>this.markers().find(m=>m.id===this.selected()));
 readonly detailGroups=computed(()=>{
  const rows=this.selection()?.rows||[];
  return [...new Set(rows.map(i=>i.groupId||i.id))].map(id=>({id,eventType:rows.find(i=>(i.groupId||i.id)===id)!.eventType,count:rows.filter(i=>(i.groupId||i.id)===id).length}));
 });
 readonly detailId=computed(()=>this.detailGroups().some(g=>g.id===this.detailGroup())?this.detailGroup():this.detailGroups()[0]?.id||'');
 readonly detailRows=computed(()=>{const marker=this.selection();return marker ? marker.groupIds.length===1 ? marker.rows : marker.rows.filter(i=>(i.groupId||i.id)===this.detailId()) : [];});
 constructor(){
  effect(()=>{
   const rows=this.rows(),markers=this.markers();
   const current=new Set(rows.map(i=>i.id));
   const before=this.seen;
   const assignments=new Map<string,{groupId:string;x:number;y:number}>();
   for(const marker of markers)for(const row of marker.rows)assignments.set(row.id,{groupId:marker.id,x:marker.x,y:marker.y});
   const fresh=rows.filter(i=>located(i)&&assignments.has(i.id)&&(!before.has(i.id)||before.get(i.id)!.groupId!==assignments.get(i.id)!.groupId));
   this.seen=assignments;
   this.arrivals.update(list=>list.filter(a=>current.has(a.id)&&markers.some(m=>m.id===a.groupId)));
   if(!fresh.length || matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   const batch:Arrival[]=[];
   for(const row of fresh){
    const target=markers.find(m=>m.rows.some(i=>i.id===row.id));if(!target)continue;
    const source=project(row);
    const hash=[...row.id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
    const angle=(hash%360)*Math.PI/180,radius=35+(hash%14);
    const previous=before.get(row.id);
    batch.push({id:row.id,groupId:target.id,x:previous?.x ?? source.x+Math.cos(angle)*radius,y:previous?.y ?? source.y+Math.sin(angle)*radius,sourceX:source.x,sourceY:source.y,targetX:target.x,targetY:target.y,severity:row.severity});
   }
   this.arrivals.update(list=>[...list.filter(a=>!batch.some(b=>b.id===a.id)),...batch]);
   const timer=setTimeout(()=>{this.arrivals.update(list=>list.filter(a=>!batch.some(b=>b.id===a.id)));this.timers.delete(timer);},1700);
   this.timers.add(timer);
  });
 }
 ngOnDestroy(){for(const timer of this.timers)clearTimeout(timer);}
 color(s:number){return s>=4?'#d63546':s===3?'#ed861e':'#d7a400';}
 label(m:Marker){return `${m.rows.length} rapoarte, severitate ${m.severity}, ${m.rows[0].zone}${m.groupIds.length>1 ? ', '+m.groupIds.length+' intervenții distincte' : ''}`;}
}
