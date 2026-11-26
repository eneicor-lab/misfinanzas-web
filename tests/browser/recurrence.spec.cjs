const{test,expect}=require('@playwright/test');
const KEY='presupuesto_demo_obligaciones_v12';
test.beforeEach(async({page})=>{await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8765/')?r.continue():r.abort());});
test('custom recurrence persists, restores, pauses and cancels without financial posting',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.evaluate(()=>navTo('obligaciones'));
 const before=await page.evaluate(()=>MF_APP_STORE.read().state.bank.events.length);
 await page.locator('#oblName').fill('Suscripción QA cinco meses');await page.locator('#oblType').selectOption('custom');await expect(page.locator('#oblIntervalLabel')).toBeVisible();
 await page.locator('#oblDate').fill('2027-01-31');await page.locator('#oblEndDate').fill('2028-12-31');await page.locator('#oblEvery').fill('5');await page.locator('#oblUnit').selectOption('month');await page.locator('#oblAmount').fill('1200');await page.locator('#obligationForm button[type=submit]').click();
 await expect(page.locator('#oblList')).toContainText('Cada 5 meses');await page.reload();await page.evaluate(()=>navTo('obligaciones'));await expect(page.locator('#oblList')).toContainText('Suscripción QA cinco meses');
 let data=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);expect(data).toHaveLength(1);expect(data[0]).toMatchObject({type:'custom',unit:'month',every:5,endDate:'2028-12-31'});
 await page.locator('#oblList').getByRole('button',{name:'Pausar',exact:true}).click();await expect(page.locator('#oblList')).toContainText('Recordatorio pausado');await page.locator('#oblList').getByRole('button',{name:'Cancelar programación',exact:true}).click();await expect(page.locator('#oblList')).toContainText('Recordatorio cancelado');
 data=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);expect(data[0].cancelled).toBe(true);expect(await page.evaluate(()=>MF_APP_STORE.read().state.bank.events.length)).toBe(before);expect(errors).toEqual([]);
});
test('all preset frequencies and invalid end date are checked through the form',async({page})=>{
 await page.goto('/');await page.evaluate(()=>navTo('obligaciones'));
 for(const type of ['once','daily','weekly','monthly','bimonthly','quarterly','semiannual','yearly']){
  await page.locator('#oblName').fill('QA '+type);await page.locator('#oblType').selectOption(type);await page.locator('#oblDate').fill('2027-01-31');await page.locator('#obligationForm button[type=submit]').click();
 }
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).length,KEY)).toBe(8);
 await page.locator('#oblName').fill('QA invalid');await page.locator('#oblDate').fill('2027-01-31');await page.locator('#oblEndDate').fill('2026-12-31');await page.locator('#obligationForm button[type=submit]').click();await expect(page.locator('#oblFeedback')).toContainText('fecha final');expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).length,KEY)).toBe(8);
});
test('custom subscription synchronizes to another device and restores the same upcoming date',async({browser})=>{
 let remote=null;const contexts=[];
 async function client(){const ctx=await browser.newContext({extraHTTPHeaders:{"X-MisFinanzas-Component-QA":"synthetic-component-only"}});contexts.push(ctx);const p=await ctx.newPage();await p.goto('http://127.0.0.1:8765/');await p.evaluate(()=>navTo('obligaciones'));return p;}
 try{const a=await client(),b=await client();
  await a.locator('#oblName').fill('QA suscripción semestral');await a.locator('#oblType').selectOption('semiannual');await a.locator('#oblDate').fill('2027-01-31');await a.locator('#oblEndDate').fill('2028-12-31');await a.locator('#obligationForm button[type=submit]').click();
  const exported=await a.evaluate(async()=>{let data;const s=new MF_MODULE_SYNC.Sync({storage:localStorage,sessionId:()=> 'synthetic-owner',allowWrites:true,transport:{put:async(m,r,p)=>{data={revision:r+1,payload:p};return r+1}}});await s.push('reminders');return data});remote=exported;
  await b.evaluate(async remote=>{const s=new MF_MODULE_SYNC.Sync({storage:localStorage,sessionId:()=> 'synthetic-owner',transport:{get:async()=>remote}});await s.pull('reminders');window.dispatchEvent(new CustomEvent('mf:module-recovered',{detail:{module:'reminders'}}))},remote);
  await expect(b.locator('#oblList')).toContainText('QA suscripción semestral');expect(await b.locator('#oblList').innerText()).toBe(await a.locator('#oblList').innerText());
  await b.reload();await b.evaluate(()=>navTo('obligaciones'));await expect(b.locator('#oblList')).toContainText('QA suscripción semestral');
  expect(await b.evaluate(()=>MF_APP_STORE.read().state.bank.events.length)).toBe(0);
 }finally{await Promise.all(contexts.map(c=>c.close()))}
});
