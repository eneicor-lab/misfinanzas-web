const {test,expect}=require('@playwright/test');
test('explicit book sync binds verified frame session and refuses disabled backend',async({page})=>{
 const remote=new Map();let enabled=false,writes=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://qa-book.supabase.co/**',async route=>{const req=route.request(),url=req.url();let body=[];
 if(url.includes('/auth/v1/token'))body={access_token:'synthetic-book-token',user:{id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01T00:00:00Z'}};
 else if(url.includes('/book_sync_contract'))body={version:1,protected:true,enabled,authorized:true};
 else if(url.includes('/get_module_state'))body=remote.has(new URL(url).searchParams.get('p_module'))?[remote.get(new URL(url).searchParams.get('p_module'))]:[];
 else if(url.includes('/put_module_state')){writes++;const p=req.postDataJSON();expect(['book','planning','catalogs','reminders']).toContain(p.p_module);const revision=(remote.get(p.p_module)?.revision||0)+1;remote.set(p.p_module,{revision,payload:p.p_payload});body=revision;}
 await route.fulfill({json:body});});
 await page.goto('/');await page.evaluate(()=>navTo('configuracion'));await page.locator('#mf28Account').fill('Cuenta sintética sincronizable');await page.locator('#mf28Opening').fill('1000');await page.locator('#mf28AddAccount').click();await expect(page.locator('#mf53AccountStatus')).toContainText('Cuenta creada');
 await page.evaluate(()=>navTo('movimientos'));await page.locator('#mfdev-confirm').check();await page.locator('#mfdev-open').click();const frame=page.frameLocator('#mfdev-frame');
 await frame.locator('#url').fill('https://qa-book.supabase.co');await frame.locator('#key').fill('sb_publishable_synthetic_qa');await frame.locator('#email').fill('synthetic@example.test');await frame.locator('#password').fill('SyntheticOnly!12345');await frame.locator('#login').click();await expect(frame.locator('#shell')).toBeVisible();
 await page.locator('#mfBookAllowPush').check();await page.locator('#mfBookPush').click();await expect(page.locator('#mfBookSyncStatus')).toContainText('Servidor no habilitado');expect(writes).toBe(0);
 enabled=true;await page.locator('#mfBookAllowPush').check();await page.locator('#mfBookPush').click();await expect(page.locator('#mfBookSyncStatus')).toContainText('enviado con revisión 1');expect(writes).toBe(1);expect(Object.keys(remote.get('book').payload.bank.accounts)).toHaveLength(1);
 await page.locator('#mfBookPull').click();await expect(page.locator('#mfBookSyncStatus')).toContainText('recuperado con revisión 1');
 await page.evaluate(()=>localStorage.setItem('misfinanzas_planning_v1',JSON.stringify(MF_PLANNING.addBudget(MF_PLANNING.fresh(),{id:'qa-budget',month:'2026-01',category:'Comida QA',limit:300}))));
 await page.locator('#mfSyncModule').selectOption('planning');await page.locator('#mfBookAllowPush').check();await page.locator('#mfBookPush').click();await expect(page.locator('#mfBookSyncStatus')).toContainText('enviado con revisión 1');expect(writes).toBe(2);expect(remote.get('planning').payload.budgets[0].category).toBe('Comida QA');
 await page.evaluate(()=>localStorage.removeItem('misfinanzas_planning_v1'));await page.locator('#mfBookPull').click();await expect(page.locator('#mfBookSyncStatus')).toContainText('recuperado con revisión 1');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('misfinanzas_planning_v1')).budgets[0].category)).toBe('Comida QA');
 expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain('synthetic-book-token');await frame.getByRole('button',{name:'Salir',exact:true}).click();await page.locator('#mfBookPull').click();await expect(page.locator('#mfBookSyncStatus')).toContainText('Inicia sesión');expect(errors).toEqual([]);
});
