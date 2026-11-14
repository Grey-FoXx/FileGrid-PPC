import { Incident } from './api';
import { ROMANIA_OUTLINE } from './romania-outline';
export interface MapMarker { id:string; x:number; y:number; anchorX:number; anchorY:number; severity:number; rows:Incident[]; }
export const project=(i:Incident)=>({x:(i.longitude!-20)*70,y:(48.6-i.latitude!)*100});
export const located=(i:Incident)=>{
 if(typeof i.latitude!=='number'||typeof i.longitude!=='number'||!Number.isFinite(i.latitude)||!Number.isFinite(i.longitude))return false;
 if(i.latitude<43.5||i.latitude>48.4||i.longitude<20.1||i.longitude>29.8)return false;
 const point=project(i);return insideRomania(point.x,point.y);
};
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
const COUNTRY_POINTS = [...ROMANIA_OUTLINE.matchAll(/[ML]([\d.]+),([\d.]+)/g)]
 .map(match=>({x:Number(match[1]),y:Number(match[2])}));
function pointSegmentDistance(x:number,y:number,a:{x:number;y:number},b:{x:number;y:number}){
 const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)):0;
 return Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy));
}
export function insideRomania(x:number,y:number,margin=0){
 let inside=false,minEdge=Infinity;
 for(let i=0,j=COUNTRY_POINTS.length-1;i<COUNTRY_POINTS.length;j=i++){
  const a=COUNTRY_POINTS[j],b=COUNTRY_POINTS[i];
  if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  minEdge=Math.min(minEdge,pointSegmentDistance(x,y,a,b));
 }
 return inside&&minEdge>=margin;
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
 const spacing=Math.max(26,Math.min(60,300/Math.sqrt(Math.max(ordered.length,1))));
 const margin=20;
 for(const marker of ordered){
  const valid=(x:number,y:number)=>insideRomania(x,y,margin)&&inRegion(marker,x,y);
  const free=(x:number,y:number)=>valid(x,y)&&result.every(other=>Math.hypot(other.x-x,other.y-y)>=spacing);
  const old=previous.get(marker.id);
  let point=old && Math.hypot(old.anchorX-marker.anchorX,old.anchorY-marker.anchorY)<12 && free(old.x,old.y)?{x:old.x,y:old.y}:null;
  if(!point && free(marker.anchorX,marker.anchorY))point={x:marker.anchorX,y:marker.anchorY};
  for(let ring=1;ring<=4&&!point;ring++){
   const radius=spacing*ring,steps=Math.max(12,Math.ceil(2*Math.PI*radius/spacing));
   for(let step=0;step<steps;step++){
    const angle=step*2*Math.PI/steps;
    const x=marker.anchorX+Math.cos(angle)*radius,y=marker.anchorY+Math.sin(angle)*radius;
    if(free(x,y)){point={x,y};break;}
   }
  }
  if(!point){
   // Saturated zones prefer a nearby in-country overlap over long leader lines outside the map.
   const candidates:{x:number;y:number;score:number}[]=[];
   for(let y=45;y<=495;y+=10)for(let x=35;x<=680;x+=10){
    if(!valid(x,y)||Math.hypot(x-marker.anchorX,y-marker.anchorY)>spacing*4)continue;
    const separation=result.length?Math.min(...result.map(other=>Math.hypot(other.x-x,other.y-y))):spacing;
    candidates.push({x,y,score:separation-Math.hypot(x-marker.anchorX,y-marker.anchorY)*.08});
   }
   const best=candidates.sort((a,b)=>b.score-a.score)[0];
   point=best?{x:best.x,y:best.y}:{x:marker.anchorX,y:marker.anchorY};
  }
  result.push({...marker,...point});
 }
 previous.clear();for(const marker of result)previous.set(marker.id,marker);
 return result;
}
