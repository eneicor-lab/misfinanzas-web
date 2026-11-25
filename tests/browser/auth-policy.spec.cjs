const {test,expect}=require('@playwright/test');
async function connection(page){await page.goto('/supabase-dev.html');await page.locator('#url').fill('https://qa-misfinanzas.supabase.co');await page.locator('#key').fill('sb_publishable_synthetic_qa');await page.locator('#email').fill('synthetic@example.test');}
test('weak credentials are rejected before contacting the provider',async({page})=>{
 let calls=0;await page.route('https://qa-misfinanzas.supabase.co/**',async route=>{calls++;await route.abort()});await connection(page);await page.locator('#password').fill('Short1!');await page.locator('#login').click();await expect(page.locator('#status')).toContainText('12 caracteres');expect(calls).toBe(0);await expect(page.locator('#shell')).toBeHidden();
});
test('provider user without a verified email never opens the application',async({page})=>{
 await page.route('https://qa-misfinanzas.supabase.co/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'synthetic-unverified-token',user:{id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:null}})}));await connection(page);await page.locator('#password').fill('SyntheticOnly!12345');await page.locator('#login').click();await expect(page.locator('#status')).toContainText('correo debe estar verificado');await expect(page.locator('#shell')).toBeHidden();expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain('synthetic-unverified-token');
});
