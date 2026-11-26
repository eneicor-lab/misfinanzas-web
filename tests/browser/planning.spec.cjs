const {test,expect}=require('@playwright/test');
test('budget, goal and reserves use existing money without posting movements',async({page})=>{
 await page.goto('/');await page.evaluate(()=>navTo('configuracion'));await page.locator('#mf28Account').fill('Cuenta planificación QA');await page.locator('#mf28Opening').fill('1000');await page.locator('#mf28AddAccount').click();
 const account=await page.evaluate(()=>Object.values(MF_APP_STORE.read().state.bank.accounts).find(a=>a.name==='Cuenta planificación QA').id);
 await page.evaluate(()=>navTo('planificacion'));await page.locator('#mfBudgetMonth').fill('2026-11');await page.locator('#mfBudgetLimit').fill('500');await page.locator('#mfBudgetForm button').click();await expect(page.locator('#mfBudgets')).toContainText('2026-11');
 await page.evaluate(()=>navTo('ahorros'));await page.locator('#mfGoalName').fill('Emergencia QA');await page.locator('#mfGoalAccount').selectOption(account);await page.locator('#mfGoalTarget').fill('500');await page.locator('#mfGoalForm button').click();await expect(page.locator('#mfGoals')).toContainText('Emergencia QA');
 await page.locator('#mfReserveName').fill('Asignación QA');await page.locator('#mfReserveAccount').selectOption(account);await page.locator('#mfReserveGoal').selectOption({label:'Emergencia QA'});await page.locator('#mfReserveAmount').fill('300');await page.locator('#mfReserveForm button').click();await expect(page.locator('#mfReservations')).toContainText('Asignación QA');
 await page.locator('#mfReserveAmount').fill('800');await page.locator('#mfReserveForm button').click();await expect(page.locator('#mfPlanStatus')).toContainText('supera');
 expect(await page.evaluate(()=>MF_APP_STORE.read().state.bank.events.length)).toBe(0);
 await page.reload();await page.evaluate(()=>navTo('ahorros'));await expect(page.locator('#mfReservations')).toContainText('Asignación QA');await page.locator('#mfReservations button').click();await expect(page.locator('#mfReservations')).toBeEmpty();expect(await page.evaluate(()=>MF_APP_STORE.read().state.bank.events.length)).toBe(0);
});
