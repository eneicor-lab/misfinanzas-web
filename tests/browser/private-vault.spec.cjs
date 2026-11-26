const{test,expect}=require('@playwright/test');
const pass='Synthetic+Vault!123';
async function open(page,{create=false}={}){await page.locator('#vaultPassword').fill(pass);if(create)await page.locator('#vaultConfirmation').fill(pass);await page.locator('#vaultOpen').click();await expect(page.locator('#mfPrivateApp')).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.MF_APP_READY)).toBe(true);return page.frameLocator('#mfPrivateApp');}
test.beforeEach(async({page})=>{await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:8765/')?route.continue():route.abort());});
test('real private entrypoint encrypts financial form data and locks without plaintext persistence',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#vaultForm')).toBeVisible();await expect(page.locator('#mfPrivateApp')).toHaveCount(0);
 const app=await open(page,{create:true});await app.locator('body').evaluate(()=>navTo('configuracion'));
 await app.locator('#mf28Account').fill('PRIVATE_SYNTHETIC_ACCOUNT');await app.locator('#mf28Opening').fill('50000');await app.locator('#mf28AddAccount').click();await expect(app.locator('#mf53AccountStatus')).toContainText('Cuenta creada');
 const bytes=await page.evaluate(()=>({...localStorage}));expect(Object.keys(bytes)).toContain('mf_private_vault_v1');expect(bytes.misfinanzas_unified_ledger_v1).toBeUndefined();expect(JSON.stringify(bytes)).not.toContain('PRIVATE_SYNTHETIC_ACCOUNT');
 await page.screenshot({path:info.outputPath('private-unlocked-synthetic.png'),fullPage:true});await page.locator('#vaultLock').click();await expect(page.locator('#mfPrivateApp')).toHaveCount(0);await expect(page.locator('#vaultForm')).toBeVisible();expect(await page.evaluate(()=>MF_VAULT.unlocked)).toBe(false);
 await page.locator('#vaultPassword').fill('Wrong+Password!123');await page.locator('#vaultOpen').click();await expect(page.locator('#vaultStatus')).toContainText('clave');await expect(page.locator('#mfPrivateApp')).toHaveCount(0);
 const restored=await open(page);await restored.locator('body').evaluate(()=>navTo('configuracion'));await expect(restored.locator('#mf28Accounts')).toContainText('PRIVATE_SYNTHETIC_ACCOUNT');
 await restored.locator('#userButton').click();await restored.locator('#logoutDemo').click();await expect(page.locator('#mfPrivateApp')).toHaveCount(0);expect(errors).toEqual([]);
});
test('direct private URL, reload and concurrent tab cannot bypass locked access',async({page,context})=>{
 await page.goto('/app.html');await expect(page.locator('#vaultForm')).toBeVisible();await open(page,{create:true});
 const second=await context.newPage();await second.goto('http://127.0.0.1:8765/');await second.locator('#vaultPassword').fill(pass);await second.locator('#vaultOpen').click();await expect(second.locator('#vaultStatus')).toContainText('otra pestaña');await expect(second.locator('#mfPrivateApp')).toHaveCount(0);await second.close();
 await page.reload();await expect(page.locator('#vaultForm')).toBeVisible();await expect(page.locator('#mfPrivateApp')).toHaveCount(0);await open(page);
 await page.evaluate(()=>MF_PRIVATE_LOCK());await expect(page.locator('#mfPrivateApp')).toHaveCount(0);
});
test('pre-existing private namespaces migrate only after verified encryption and remain recoverable',async({page})=>{
 await page.goto('/');await page.evaluate(()=>{localStorage.setItem('misfinanzas_planning_v1',JSON.stringify({version:1,budgets:[],goals:[],reservations:[]}));localStorage.setItem('presupuesto_demo_obligaciones_v12',JSON.stringify([{id:'q',name:'PRIVATE_SYNTHETIC_REMINDER',type:'monthly',date:'2027-01-31',leads:[0],paused:false}]));});
 const app=await open(page,{create:true});await app.locator('body').evaluate(()=>navTo('obligaciones'));await expect(app.locator('#oblList')).toContainText('PRIVATE_SYNTHETIC_REMINDER');expect(await page.evaluate(()=>localStorage.getItem('presupuesto_demo_obligaciones_v12'))).toBeNull();expect(await page.evaluate(()=>localStorage.getItem('mf_private_vault_v1'))).not.toContain('PRIVATE_SYNTHETIC_REMINDER');
 await page.locator('#vaultLock').click();await open(page);await page.reload();await expect(page.locator('#vaultForm')).toBeVisible();
});
