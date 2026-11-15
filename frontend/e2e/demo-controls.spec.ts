import { test, expect } from '@playwright/test';
test('global volume, shared synthetic notification, recovery feedback and reduced-motion counters',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const state:any={enabled:true,initialized:true,mode:'NORMAL',generating:false,seedVersion:'fixture',flow:{multiplier:1},notifications:[],integrityProbes:[]};
 const writes:any[]=[];
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/api/v1','');
  let body:any={};try{body=route.request().postDataJSON()}catch{}
  if(path==='/me')return route.fulfill({json:{username:'admin',role:'ADMIN',features:{demo:true}}});
  if(path==='/demo/volume'){writes.push(body);state.flow.multiplier=body.multiplier;return route.fulfill({json:{multiplier:body.multiplier}})}
  if(path==='/demo/notifications/test'){state.notifications=[{id:'notice',synthetic:true,message:'Risc de test partajat',createdAt:new Date().toISOString()}];return route.fulfill({json:{id:'notice'}})}
  if(path==='/demo/integrity-probes'){state.integrityProbes=[{fileId:'fixture-file',state:'RECOVERED',detail:'SHA-256 confirmat după recuperare automată',updatedAt:new Date().toISOString()}];return route.fulfill({json:{fileId:'fixture-file'}})}
  if(path==='/demo')return route.fulfill({json:state});
  if(path==='/stats/business')return route.fulfill({json:{files:123,readings:456,incidents:6,recentIncidents:2,mode:'NORMAL',zones:[]}});
  if(path==='/stats/technical')return route.fulfill({json:{series:[]}});
  return route.fulfill({json:{items:[],total:0,page:0,size:25}});
 });
 await page.goto('/');await page.getByLabel('Parolă',{exact:true}).fill('fixture');await page.getByRole('button',{name:/Intră în platformă/}).click();
 const slider=page.getByRole('slider',{name:'Volum simulator 1 până la 10'});
 await expect(slider).toBeVisible();await slider.fill('10');await slider.dispatchEvent('change');
 await expect(slider).toHaveValue('10');expect(writes).toContainEqual({multiplier:10});
 await page.getByRole('button',{name:'▤ Fișiere',exact:true}).click();await expect(slider).toBeVisible();
 await page.locator('nav button').filter({hasText:'Acasă'}).click();
 await expect(page.locator('filegrid-rolling-number').first().locator('.sr-only')).toHaveText('123');
 expect(await page.locator('.digit-reel').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.getByRole('button',{name:'Simulează notificare de risc',exact:true}).click();
 await expect(page.getByText('Risc de test partajat',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Testează corupere și recuperare automată',exact:true}).click();
 await expect(page.getByText('3 · Recuperat și verificat',{exact:true})).toBeVisible();
});
