/* Teste de KMZ fictício no visualizador OpenFreeMap, aberto via file://. */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = 'file://' + path.join(root, 'dist', 'Visualizador_KML_OpenFreeMap.html');
const kmz = path.join(root, 'exemplos', 'exemplo-ficticio.kmz');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const network = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
try {
  await page.goto(html);
  await page.locator('#totalCount').filter({ hasText: '8' }).waitFor();
  assert.equal(network.length, 0, 'Abrir o mapa com offline ativo não pode acessar a rede');
  const accept = await page.locator('#upload').getAttribute('accept');
  assert.ok(accept.includes('.kmz'), 'O pacote deve permitir seleção de KMZ');
  assert.ok(await page.locator('#dropzone').innerText().then(s => s.includes('KMZ')), 'Interface deve mostrar KMZ');
  await page.locator('#upload').setInputFiles(kmz);
  await page.locator('#totalCount').filter({ hasText: '4' }).waitFor({ timeout: 20000 });
  assert.equal(await page.locator('#fileName').innerText(), 'exemplo-ficticio.kmz');
  assert.equal(await page.locator('.result').count(), 4);
  await page.locator('.result').first().click();
  await page.locator('#detailTitle').waitFor();
  assert.equal(network.length, 0, 'Importar KMZ e clicar nos dados não pode enviar dados à rede');
  assert.deepEqual(errors, [], 'Nenhum erro de JavaScript deve ocorrer');
  console.log('KMZ smoke OK: arquivo ZIP local, KML interno, 4 marcadores, popup e zero requisições externas');
} finally {
  await page.close();
  await browser.close();
}
