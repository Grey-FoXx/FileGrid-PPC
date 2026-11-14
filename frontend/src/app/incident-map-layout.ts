import { Incident } from './api';
import { ROMANIA_OUTLINE } from './romania-outline';
export interface MapMarker { id:string; x:number; y:number; anchorX:number; anchorY:number; severity:number; rows:Incident[]; groupIds:string[]; }
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
  if(!group){group={id:row.groupId||row.id,x:0,y:0,anchorX:0,anchorY:0,severity:row.severity,rows:[],groupIds:[row.groupId||row.id]};groups.push(group);}
  group.rows.push(row);group.severity=Math.max(group.severity,row.severity);
 }
 return groups.filter(g=>g.rows.some(located)).map(g=>{
  const points=g.rows.filter(located).map(project);
  const origin=points[0];
  const x=origin.x+points.reduce((s,p)=>s+p.x-origin.x,0)/points.length,y=origin.y+points.reduce((s,p)=>s+p.y-origin.y,0)/points.length;
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
const countryRings=(ROMANIA_OUTLINE.match(/M[^M]+/g)||[]).map(ring=>{
 const values=(ring.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);
 return Array.from({length:values.length/2},(_,i)=>({x:values[i*2],y:values[i*2+1]}));
});
export function insideRomania(x:number,y:number){
 let inside=false;
 for(const ring of countryRings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
function circleInsideCountry(x:number,y:number){
 // Reserve the maximum marker radius plus a small border, including future count growth.
 return insideRomania(x,y)&&Array.from({length:24},(_,i)=>i*Math.PI/12).every(angle=>insideRomania(x+Math.cos(angle)*27,y+Math.sin(angle)*27));
}
function mergeVisual(target:MapMarker,source:MapMarker){
 target.rows=[...target.rows,...source.rows];target.groupIds=[...target.groupIds,...source.groupIds];target.severity=Math.max(target.severity,source.severity);
 const points=target.rows.filter(located).map(project);
 const origin=points[0];
 target.anchorX=origin.x+points.reduce((sum,p)=>sum+p.x-origin.x,0)/points.length;target.anchorY=origin.y+points.reduce((sum,p)=>sum+p.y-origin.y,0)/points.length;
}
function zoneKey(m:MapMarker){return m.rows[0].zone.trim().toLocaleLowerCase('ro');}
/** Bounded display offsets; density overflow becomes a VISUAL aggregate, never a backend merge. */
export function separateMarkers(markers:MapMarker[],previous:Map<string,MapMarker>):MapMarker[]{
 const result:MapMarker[]=[];
 const crowded=new Map<string,MapMarker>();
 const ordered=[...markers].sort((a,b)=>Number(previous.has(b.id))-Number(previous.has(a.id))||a.id.localeCompare(b.id));
 for(const marker of ordered){
  const key=zoneKey(marker)+':'+Math.round(marker.anchorX/4)+':'+Math.round(marker.anchorY/4);
  const aggregate=crowded.get(key);
  if(aggregate&&Math.hypot(aggregate.x-marker.anchorX,aggregate.y-marker.anchorY)<=90){mergeVisual(aggregate,marker);continue;}
  const within=(x:number,y:number)=>Math.hypot(x-marker.anchorX,y-marker.anchorY)<=90 && inRegion(marker,x,y) && circleInsideCountry(x,y);
  const free=(x:number,y:number)=>within(x,y)&&result.every(other=>Math.hypot(other.x-x,other.y-y)>=56);
  const old=previous.get(marker.id);
  let point=old && free(old.x,old.y)?{x:old.x,y:old.y}:null;
  if(!point && free(marker.anchorX,marker.anchorY))point={x:marker.anchorX,y:marker.anchorY};
  for(let radius=12;radius<=90&&!point;radius+=6)for(let step=0;step<32;step++){
   const angle=step*Math.PI/16,x=marker.anchorX+Math.cos(angle)*radius,y=marker.anchorY+Math.sin(angle)*radius;
   if(free(x,y)){point={x,y};break;}
  }
  if(point){result.push({...marker,...point});continue;}
  const nearby=result.filter(other=>zoneKey(other)===zoneKey(marker)&&Math.hypot(other.x-marker.anchorX,other.y-marker.anchorY)<=90)
   .sort((a,b)=>Math.hypot(a.x-marker.anchorX,a.y-marker.anchorY)-Math.hypot(b.x-marker.anchorX,b.y-marker.anchorY))[0];
  if(nearby){
   mergeVisual(nearby,marker);crowded.set(key,nearby);
   continue;
  }
  // If no independent slot remains, use a local visual aggregate instead of sending dots abroad.
  const local=result.filter(other=>Math.hypot(other.x-marker.anchorX,other.y-marker.anchorY)<=90)[0];
  if(local){mergeVisual(local,marker);crowded.set(key,local);continue;}
  // Border cases may use the nearest safe local point outside an approximate highlight,
  // but never an out-of-country marker or an unbounded displacement.
  for(let radius=0;radius<=90&&!point;radius+=6)for(let step=0;step<32;step++){
   const angle=step*Math.PI/16,x=marker.anchorX+Math.cos(angle)*radius,y=marker.anchorY+Math.sin(angle)*radius;
   if(circleInsideCountry(x,y)&&result.every(other=>Math.hypot(other.x-x,other.y-y)>=56)){point={x,y};break;}
  }
  if(point)result.push({...marker,...point});
 }
 previous.clear();for(const marker of result)previous.set(marker.id,marker);
 return result;
}
