import { Incident } from './api';
export interface MapMarker { id:string; x:number; y:number; anchorX:number; anchorY:number; severity:number; rows:Incident[]; }
export const located=(i:Incident)=>typeof i.latitude==='number' && typeof i.longitude==='number' && Number.isFinite(i.latitude) && Number.isFinite(i.longitude) && i.latitude>=43.5 && i.latitude<=48.4 && i.longitude>=20.1 && i.longitude<=29.8;
export const project=(i:Incident)=>({x:(i.longitude!-20)*70,y:(48.6-i.latitude!)*100});
export function groupMarkers(rows:Incident[]):MapMarker[]{
 const groups:MapMarker[]=[];
 for(const row of rows){
  if(!row.groupId && !located(row))continue;
  const time=Date.parse(row.occurredAt||row.createdAt||'');
  let group=groups.find(g=>row.groupId?g.id===row.groupId:!g.rows[0].groupId && g.rows.every(other=>{
   const otherTime=Date.parse(other.occurredAt||other.createdAt||'');
   return other.eventType===row.eventType && located(other) && Number.isFinite(time) && Number.isFinite(otherTime) && Math.abs(time-otherTime)<=1800000 && Math.hypot((other.longitude!-row.longitude!)*77,(other.latitude!-row.latitude!)*111)<=8;
  }));
  if(!group){group={id:row.groupId||row.id,x:0,y:0,anchorX:0,anchorY:0,severity:row.severity,rows:[]};groups.push(group);}
  group.rows.push(row);group.severity=Math.max(group.severity,row.severity);
 }
 return groups.filter(g=>g.rows.some(located)).map(g=>{
  const points=g.rows.filter(located).map(project);
  const x=points.reduce((s,p)=>s+p.x,0)/points.length,y=points.reduce((s,p)=>s+p.y,0)/points.length;
  return {...g,x,y,anchorX:x,anchorY:y};
 });
}
function inRegion(m:MapMarker,x:number,y:number){
 const zone=m.rows[0].zone.toLocaleLowerCase('ro');
 const ellipse=zone.includes('banat')?[118,326,90,100]:zone.includes('muntenia')?[402,422,133,68]:zone.includes('dobrogea')?[604,364,57,112]:null;
 if(!ellipse)return true;
 const [cx,cy,rx,ry]=ellipse;
 const inside=(px:number,py:number)=>((px-cx)/rx)**2+((py-cy)/ry)**2<=1;
 return !inside(m.anchorX,m.anchorY)||inside(x,y);
}
/** Display-only offsets: exact API coordinates stay in anchorX/Y and leader lines. */
export function separateMarkers(markers:MapMarker[],previous:Map<string,MapMarker>):MapMarker[]{
 const result:MapMarker[]=[];
 const ordered=[...markers].sort((a,b)=>Number(previous.has(b.id))-Number(previous.has(a.id))||a.id.localeCompare(b.id));
 for(const marker of ordered){
  const free=(x:number,y:number)=>x>=20&&x<=690&&y>=20&&y<=535&&result.every(other=>Math.hypot(other.x-x,other.y-y)>=60);
  const old=previous.get(marker.id);
  let point=old && Math.hypot(old.anchorX-marker.anchorX,old.anchorY-marker.anchorY)<12 && free(old.x,old.y)?{x:old.x,y:old.y}:null;
  if(!point && free(marker.anchorX,marker.anchorY))point={x:marker.anchorX,y:marker.anchorY};
  for(const restrictRegion of [true,false]){
   if(point)break;
   for(let ring=1;ring<=8&&!point;ring++)for(let step=0;step<16;step++){
    const angle=step*Math.PI/8, radius=62*ring;
    const x=marker.anchorX+Math.cos(angle)*radius,y=marker.anchorY+Math.sin(angle)*radius;
    if(free(x,y)&&(!restrictRegion||inRegion(marker,x,y))){point={x,y};break;}
   }
  }
  // The demo is bounded; this fallback preserves exact coordinates if the view is saturated.
  result.push({...marker,...(point||{x:marker.anchorX,y:marker.anchorY})});
 }
 previous.clear();for(const marker of result)previous.set(marker.id,marker);
 return result;
}
