const {test,expect}=require('@playwright/test');
const KEY='misfinanzas_motor_integrado_v028';
async function nav(page,id){await page.evaluate(id=>navTo(id),id);await expect(page.locator('#'+id)).toBeVisible();}
test.beforeEach(async({page})=>{await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:8765/')?route.continue():route.abort());});
test('initial load, navigation, identity and JavaScript errors',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.locator('#inicio')).toBeVisible();
 for(const id of ['movimientos','planificacion','deudas','ahorros','administracion','acerca'])await nav(page,id);
 await expect(page.locator('#acerca')).toContainText('Creado por: Eduardo Neisa Cortés');
 await expect(page.locator('#acerca')).toContainText('MisFinanzas');
 await page.screenshot({path:info.outputPath('about.png'),fullPage:true});expect(errors).toEqual([]);
});
test('accounts, cash, duplicate protection, persistent reload',async({page})=>{
 await page.goto('/');await nav(page,'configuracion');
 for(const [name,type,opening] of [['Banco QA','bank','100000'],['Efectivo QA','cash','20000']]){
 await page.locator('#mf28Account').fill(name);await page.locator('#mf39AccountType').selectOption(type);await page.locator('#mf28Opening').fill(opening);await page.locator('#mf28AddAccount').click();await expect(page.locator('#mf53AccountStatus')).toContainText('Cuenta creada');}
 await page.locator('#mf28Account').fill('Banco QA');await page.locator('#mf39AccountType').selectOption('bank');await page.locator('#mf28AddAccount').click();await expect(page.locator('#mf53AccountStatus')).toContainText('Ya existe');
 await page.reload();expect(await page.evaluate(k=>Object.values(JSON.parse(localStorage.getItem(k)).accounts).filter(a=>/QA$/.test(a.name)).length,KEY)).toBe(2);
});
test('income, expense, transfer and insufficient balance through forms',async({page})=>{
 await page.goto('/');await nav(page,'configuracion');for(const name of ['QA origen','QA destino']){await page.locator('#mf28Account').fill(name);await page.locator('#mf28Opening').fill('10000');await page.locator('#mf28AddAccount').click();}
 const ids=await page.evaluate(k=>Object.values(JSON.parse(localStorage.getItem(k)).accounts).filter(a=>a.name.startsWith('QA ')).map(a=>a.id),KEY);
 await nav(page,'movimientos');
 for(const [type,amount,third] of [['income','1000','Pagador QA'],['expense','500','Comercio QA'],['transfer','300','']]){
 await page.locator('#mf28Type').selectOption(type);if(type!=='income')await page.locator('#mf28From').selectOption(ids[0]);if(type!=='expense')await page.locator('#mf28To').selectOption(type==='transfer'?ids[1]:ids[0]);
 if(third)await page.locator('#mf53Third').fill(third);await page.locator('#mf28Date').fill('2026-01-01');await page.locator('#mf28Amount').fill(amount);await page.locator('#mf28Concept').fill('QA '+type);await page.locator('#mf28Transaction button[type=submit]').click();await expect(page.locator('#mf28Status')).toContainText('Movimiento registrado');}
 const before=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).events.length,KEY);
 await page.locator('#mf28Type').selectOption('expense');await page.locator('#mf28From').selectOption(ids[0]);await page.locator('#mf53Third').fill('QA');await page.locator('#mf28Amount').fill('999999');await page.locator('#mf28Transaction button[type=submit]').click();await expect(page.locator('#mf28Status')).toContainText('No se registró');expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).events.length,KEY)).toBe(before);
});
test('responsive viewport, labels and keyboard menu',async({page},info)=>{
 await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 for(const id of ['mf28Account','mf28Opening','mf28Amount','mf28Concept'])expect(await page.locator('#'+id).evaluate(e=>e.labels.length)).toBeGreaterThan(0);
 if(info.project.name==='mobile'){await page.locator('#mnMenuToggle').click();await expect(page.locator('#mnMenuToggle')).toHaveAttribute('aria-expanded','true');await page.locator('#mnDrawerLinks [data-mn-page=acerca]').click();await expect(page.locator('#acerca')).toBeVisible();await expect(page.locator('#mnMenuToggle')).toHaveAttribute('aria-expanded','false');}
});
test('catalogs, reminders, debt and savings sections expose their controls',async({page},info)=>{
 await page.goto('/');for(const id of ['catalogos','planificacion','deudas','ahorros']){await nav(page,id);await expect(page.locator('#'+id)).not.toBeEmpty();await page.screenshot({path:info.outputPath(id+'.png'),fullPage:true});}
 await nav(page,'catalogos');await page.locator('[data-mn17-tab=people]').click();await expect(page.locator('#mn17Panel')).not.toBeEmpty();await page.locator('[data-mn17-tab=bills]').click();await expect(page.locator('#mn17Panel')).not.toBeEmpty();
});
test('mock authentication, read-only boundary and session removal',async({page})=>{
 const writes=[];await page.unroute('**/*');await page.route('https://qa-misfinanzas.supabase.co/**',async route=>{
 const req=route.request(),url=req.url();if(url.includes('/rest/v1/')&&req.method()!=='GET')writes.push(req.method());
 let body=url.includes('/auth/v1/token')?{access_token:'synthetic-access-token',user:{id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01T00:00:00Z'}}:url.includes('/auth/v1/user')?{id:'11111111-1111-4111-8111-111111111111'}:url.includes('/mf_accounts')?[{id:'a',name:'Banco QA',kind:'asset',currency:'COP',opening:10000,active:true}]:[];
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto('/supabase-dev.html');await page.locator('#url').fill('https://qa-misfinanzas.supabase.co');await page.locator('#key').fill('sb_publishable_synthetic_qa');await page.locator('#email').fill('synthetic@example.test');await page.locator('#password').fill('SyntheticOnly!12345');await page.locator('#login').scrollIntoViewIfNeeded();await page.locator('#login').click();await expect(page.locator('#shell')).toBeVisible();await expect(page.locator('#accounts')).toContainText('Banco QA');await expect(page.locator('#post')).toBeDisabled();await page.getByRole('button',{name:'Salir',exact:true}).click();await expect(page.locator('#loginPanel')).toBeVisible();expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain('synthetic-access-token');expect(writes).toEqual([]);
});
