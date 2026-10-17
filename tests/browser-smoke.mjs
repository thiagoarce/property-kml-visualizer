/* Teste de navegador usando exclusivamente dados fictícios. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + path.join(root, 'dist', 'Visualizador_KML.html');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 850 } });
const exceptions = [];
const external = [];
page.on('pageerror', error => exceptions.push(error.message));
page.on('request', request => {
  if (request.url().startsWith('https://')) external.push(request.url());
});
await page.route('https://tile.openstreetmap.org/**', route => route.abort()); // Não consumir tiles em teste.
try {
  await page.goto(url);
  await page.locator('#totalCount').filter({ hasText: '8' }).waitFor();
  assert.equal(await page.locator('.result').count(), 8, 'Exemplo inicial deve mostrar 8 BRAs fictícios');
  assert.ok(await page.locator('.leaflet-container').count(), 'Leaflet deve inicializar');
  await page.locator('#osmToggle').uncheck();

  const sample = path.join(root, 'exemplos', 'exemplo-ficticio.kml');
  await page.locator('#upload').setInputFiles(sample);
  await page.locator('#totalCount').filter({ hasText: '4' }).waitFor();
  assert.equal(await page.locator('.result').count(), 4, 'KML deve fornecer quatro marcadores');
  assert.equal(await page.locator('#groupCount').innerText(), '4', 'Pastas devem ser interpretadas');

  await page.locator('#search').fill('BRA9902');
  await page.locator('#filteredCount').filter({ hasText: '1' }).waitFor();
  await page.locator('.result').first().click();
  await page.locator('#detailTitle').filter({ hasText: 'BRA9902' }).waitFor();
  const tabs = page.locator('#detailBody .tabs button');
  assert.equal(await tabs.count(), 2);
  await tabs.nth(1).click();
  assert.ok(await page.locator('#detailBody').getByText('180').isVisible(), 'Aba de congregações deve aparecer');

  // Um KML malicioso não pode executar JS, carregar imagem remota nem abrir iframe.
  const attack = "<?xml version='1.0'?><kml xmlns='http://www.opengis.net/kml/2.2'><Document>" +
    "<Placemark><name>Exemplo seguro</name><description><![CDATA[" +
    "<p>Conteúdo de teste</p><script>window.__xss=true</script><iframe src='https://attacker.invalid/test'></iframe>" +
    "<img src='https://attacker.invalid/secret.png'><a href='javascript:alert(1)'>Link proibido</a>" +
    "]]></description><Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark>" +
    "</Document></kml>";
  await page.locator('#upload').setInputFiles({
    name: 'seguranca-ficticia.kml',
    mimeType: 'application/vnd.google-earth.kml+xml',
    buffer: Buffer.from(attack)
  });
  await page.locator('#totalCount').filter({ hasText: '1' }).waitFor();
  await page.locator('.result').first().click();
  assert.equal(await page.evaluate(() => Boolean(window.__xss)), false, 'Script do KML não pode executar');
  assert.equal(await page.locator('#detailBody script, #detailBody iframe, #detailBody img').count(), 0);
  assert.equal(await page.locator('#detailBody a[href^="javascript:"]').count(), 0);
  assert.ok(external.every(u => u.startsWith('https://tile.openstreetmap.org/')), 'Nenhuma requisição além dos tiles OSM');
  assert.deepEqual(exceptions, [], 'Sem erros JavaScript no navegador');
  console.log('Browser smoke OK: Leaflet, KML, busca, abas, isolamento e segurança');
} catch (error) {
  console.error('Falha: ', error, '\nErros no browser:', exceptions, '\nRequisições externas:', external);
  throw error;
} finally {
  await page.close();
  await browser.close();
}
