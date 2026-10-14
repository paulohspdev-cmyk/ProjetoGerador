import { test, expect, type Page } from '@playwright/test';
import { ensureApprovedModem } from './modem-fixture';

async function fixture(page: Page, tag: string, port: number) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(process.env.E2E_ADMIN_EMAIL!);
  await page.locator('input[aria-label="Senha"]').fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  const modem = await ensureApprovedModem(page, port);
  const r = await page.request.post('/api/generators', { data: {
    tag, name: 'Nome inicial '+tag, site: 'Unidade São João', controller: 'InteliCompact NT MINT',
    transport: 'reverse_tcp', modemId: modem.id, listenPort: port, modbusUnit: 111,
  }});
  expect(r.status()).toBe(201);
  const gen = await r.json();
  await page.goto('/p/geradores/'+gen.id);
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  return gen;
}

test('audit: editar nome, aguardar polling, salvar e recarregar', async ({ page }) => {
  test.setTimeout(60000);
  const gen = await fixture(page, 'FLOWAUDIT01', 15131);
  const d = page.getByRole('dialog');
  await d.getByLabel('Nome do gerador').fill('Gerador São José – revisão 2');
  await page.waitForTimeout(5500);
  await expect(d.getByLabel('Nome do gerador')).toHaveValue('Gerador São José – revisão 2');
  await d.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(d).not.toBeVisible();
  expect((await (await page.request.get('/api/generators/'+gen.id)).json()).name).toBe('Gerador São José – revisão 2');
  await page.reload();
  await page.getByRole('button', {name: 'Editar', exact: true}).first().click();
  await expect(d.getByLabel('Nome do gerador')).toHaveValue('Gerador São José – revisão 2');
  await d.getByLabel('Nome do gerador').fill('Alteração cancelada');
  await page.keyboard.press('Escape');
  expect((await (await page.request.get('/api/generators/'+gen.id)).json()).name).toBe('Gerador São José – revisão 2');
  console.log('AUDIT EVIDENCE: Unicode, polling, save, reload, cancellation OK');
});

test('audit: reconfiguração aceita seguida de erro cadastral deixa atualização parcial', async ({ page }) => {
  test.setTimeout(60000);
  const gen = await fixture(page, 'FLOWAUDIT02', 15132);
  const d = page.getByRole('dialog');
  let reconfigured = false;
  await page.route('**/api/generators/'+gen.id+'/reconfigure', async route => {
    const r = await page.request.patch('/api/generators/'+gen.id, { data: {modbusUnit: 112} });
    expect(r.status()).toBe(200);
    reconfigured = true;
    await route.fulfill({ json: { operationId: 'audit-mocked', status: 'succeeded', result: {ok: true} } });
  });
  await page.route('**/api/generators/'+gen.id, async route => {
    if (route.request().method()==='PATCH') await route.fulfill({status: 422, json: {detail:'Falha cadastral simulada após reconfiguração'}});
    else await route.continue();
  });
  await d.getByLabel('Unit ID Modbus').fill('112');
  await d.getByLabel('Nome do gerador').fill('Nome novo que falhará');
  await d.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(d.getByText('Falha cadastral simulada após reconfiguração')).toBeVisible();
  expect(reconfigured).toBe(true);
  const current=await (await page.request.get('/api/generators/'+gen.id)).json();
  expect(current.modbusUnit).toBe(112);
  expect(current.name).toBe(gen.name);
  await page.unrouteAll({behavior:'wait'});
  console.log('AUDIT EVIDENCE: partial edit reproduced with mocked lifecycle; no executor called');
});

test('audit: perda da atualização após PATCH fecha diálogo embora lista falhe', async ({ page }) => {
  test.setTimeout(60000);
  const gen = await fixture(page, 'FLOWAUDIT03', 15133);
  const d=page.getByRole('dialog');
  let listFailures=0;
  await page.route('**/api/generators', async route => {
    if(route.request().method()==='GET') {listFailures++;await route.fulfill({status:503,json:{detail:'Falha de atualização simulada'}});}
    else await route.continue();
  });
  await d.getByLabel('Nome do gerador').fill('Nome salvo com lista indisponível');
  await d.getByRole('button', { name:'Salvar alterações'}).click();
  await expect(d).not.toBeVisible();
  expect(listFailures).toBeGreaterThan(0);
  const current=await (await page.request.get('/api/generators/'+gen.id)).json();
  expect(current.name).toBe('Nome salvo com lista indisponível');
  await page.unrouteAll({behavior:'wait'});
  console.log('AUDIT EVIDENCE: saved record with refresh failure and dialog closed');
});

test('audit: arquivos de imagem publicados e fontes sem requisito de download externo', async ({page})=>{
  await fixture(page,'FLOWAUDIT05',15135);
  await page.keyboard.press('Escape');
  for(const name of ['generic','dse4520','dse6120','dse7320','dse8610','intelilite9','intelimains150']) {
    const r=await page.request.get('/controllers/'+name+'.png?v2');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  const font=await page.locator('body').evaluate(e=>getComputedStyle(e).fontFamily);
  expect(font.length).toBeGreaterThan(0);
  console.log('AUDIT EVIDENCE: 7 static controller images HTTP 200; body font='+font);
});

test('audit: Continuar da etapa 2 já salva sem clique final de confirmação',async({page})=>{
  test.setTimeout(60000);
  await fixture(page,'FLOWAUDIT06',15136);
  await page.keyboard.press('Escape');
  const modem=await ensureApprovedModem(page,15137);
  await page.goto('/p/geradores');
  await page.getByRole('button',{name:/Adicionar gerador/i}).first().click();
  const d=page.getByRole('dialog');
  await d.getByLabel('Nome do gerador').fill('Cadastro fechado durante salvamento');
  await d.getByLabel('Unidade').fill('Unidade audit');
  await d.getByLabel('Controladora').selectOption('InteliCompact NT MINT');
  await d.getByRole('button',{name:/Continuar/i}).click();
  await d.getByLabel('Modem aprovado').selectOption(modem.id);
  let release!:()=>void;
  let persisted!:()=>void;
  const holding=new Promise<void>(resolve=>release=resolve);
  const committed=new Promise<void>(resolve=>persisted=resolve);
  await page.route('**/api/generators',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const r=await route.fetch();expect(r.status()).toBe(201);persisted();
    await holding;await route.fulfill({response:r});
  });
  try {
    await d.getByRole('button',{name:/Continuar/i}).click();
    await Promise.race([committed,new Promise((_,reject)=>setTimeout(()=>reject(new Error('No premature submit observed')),8000))]);
    await expect(d.locator('button[type="submit"]')).toHaveText('Configurando…');
    await page.keyboard.press('Escape');
    await expect(d).not.toBeVisible();
    const rows=await (await page.request.get('/api/generators')).json();
    expect(rows.filter((g:{name:string})=>g.name==='Cadastro fechado durante salvamento')).toHaveLength(1);
    console.log('AUDIT EVIDENCE: step-2 Continue persisted before final confirmation; Escape did not cancel saved record');
  } finally { release();await page.unrouteAll({behavior:'wait'}); }
});
