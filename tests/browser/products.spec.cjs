const {test,expect}=require('@playwright/test');
const nav=(page,id)=>page.evaluate(id=>navTo(id),id);
test.beforeEach(async({page})=>{await page.goto('/');});
test('subscriptions and single obligations persist without financial postings',async({page})=>{
 await nav(page,'planificacion');const before=await page.evaluate(()=>localStorage.getItem('misfinanzas_motor_integrado_v028'));
 for(const [name,type] of [['Suscripción QA','semiannual'],['Obligación única QA','once']]){await page.locator('#oblName').fill(name);await page.locator('#oblType').selectOption(type);await page.locator('#oblDate').fill('2026-12-01');await page.locator('#oblAmount').fill('1000');await page.locator('#obligationForm button[type=submit]').click();await expect(page.locator('#oblList')).toContainText(name);}
 await page.reload();await nav(page,'planificacion');await expect(page.locator('#oblList')).toContainText('Suscripción QA');expect(await page.evaluate(()=>localStorage.getItem('misfinanzas_motor_integrado_v028'))).toBe(before);
});
test('loan registration and scheduling preserve principal until a confirmed payment',async({page})=>{
 await nav(page,'deudas');await page.locator('#mfHistoricalDebt > summary').click();await page.locator('#mf43Name').fill('Préstamo QA');await page.locator('#mf43Principal').fill('120000');await page.locator('#mf45LoanTerms').fill('12');await page.locator('#mf45LoanOriginal').fill('120000');await page.locator('#mf43New button[type=submit]').click();await expect(page.locator('#mf43Loans')).toContainText('Préstamo QA');
 await page.locator('#mf43Mode').selectOption('schedule');await page.locator('#mf43Amount').fill('10000');await page.locator('#mf43Date').fill('2026-12-01');await page.locator('#mf43Pay button[type=submit]').click();
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('misfinanzas_deudas_demo_v43')));expect(state.loans[0].principal).toBe(120000);await expect(page.locator('#mf43History')).not.toContainText('Sin operaciones.');
});
test('credit cards and installment purchases preserve their independent plan',async({page})=>{
 await nav(page,'deudas');await page.locator('#mf45TabCards').click();await page.locator('#mf45CardName').fill('Tarjeta QA');await page.locator('#mf45CardLimit').fill('1000000');await page.locator('#mf45CardNew button[type=submit]').click();await expect(page.locator('#mf45CardSummary')).toContainText('Tarjeta QA');
 await page.locator('#mf45PurchaseName').fill('Compra sintética');await page.locator('#mf45PurchaseAmount').fill('120000');await page.locator('#mf45PurchaseTerms').fill('12');await page.locator('#mf45PurchasePaid').fill('0');await page.locator('#mf45Purchase button[type=submit]').click();await expect(page.locator('#mf45CardsPanel')).toContainText('Compra sintética');
});
