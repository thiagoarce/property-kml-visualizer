/* Testa legenda e ícones KMZ por file:// exclusivamente com dados fictícios. */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + path.join(root, 'dist', 'Visualizador_KML_OpenFreeMap.html');
const kmz = path.join(root, 'exemplos', 'estilos-ficticios.kmz');
const kml = path.join(root, 'exemplos', 'estilos-ficticios.kml');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], requests = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
try {
  await page.goto(url);
  await page.locator('#totalCount').filter({ hasText: '8' }).waitFor();
  await page.locator('#upload').setInputFiles(kmz);
  await page.locator('#totalCount').filter({ hasText: '3' }).waitFor({ timeout: 20000 });
  await page.locator('[data-workspace="legenda"]').click();
  assert.equal(await page.locator('#legendEntries .legend-entry').count(), 2, 'Dois estilos distintos devem constar na legenda');
  assert.equal(await page.locator('#legendCount').innerText(), '2 tipos');
  const localIcons = page.locator('#legendEntries img.kml-icon-img');
  assert.equal(await localIcons.count(), 1, 'Imagem incorporada no KMZ deve aparecer como símbolo');
  const src = await localIcons.first().getAttribute('src');
  assert.ok(src.startsWith('blob:'), 'Ícones KMZ devem usar Blob URL local');
  assert.equal(await page.locator('#legendEntries .legend-item-count').first().innerText(), '2', 'Legenda mostra frequência');
  assert.ok(await page.locator('#legendEntries .symbol-star').count(), 'Imagem externa não deve carregar, somente símbolo substituto');
  assert.equal(requests.length, 0, 'Ícones e KML não podem solicitar recursos externos');
  await page.locator('#legendEntries .legend-entry').first().click();
  await page.locator('#filteredCount').filter({ hasText: '2' }).waitFor();
  await page.locator('#legendClear').click();
  await page.locator('#filteredCount').filter({ hasText: '3' }).waitFor();
  await page.locator('#upload').setInputFiles(kml);
  await page.waitForFunction(() => document.getElementById('fileName').textContent.trim() === 'estilos-ficticios.kml', null, { timeout: 20000 });
  await page.locator('#totalCount').filter({ hasText: '3' }).waitFor();
  assert.equal(await page.locator('#legendEntries img.kml-icon-img').count(), 0, 'KML isolado não deve carregar o href do KMZ');
  assert.equal(await page.locator('#legendEntries .legend-entry').count(), 2);
  assert.equal(requests.length, 0);
  assert.deepEqual(errors, [], 'Sem erros JavaScript');
  console.log('OK: legenda (2 tipos), filtro e ícone KMZ blob local, sem conexão externa');
} finally {
  await page.close();
  await browser.close();
}
