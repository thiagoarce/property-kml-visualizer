/* Validação dos perfis de SRs e Vendas com KMLs totalmente fictícios. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 850 } });
const requests = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
function point(description, name) {
 return '<Placemark><name>' + name + '</name><description><![CDATA[' + description +
 ']]></description><Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark>';
}
function file(xml, name) {
 return { name, mimeType:'application/vnd.google-earth.kml+xml',
   buffer: Buffer.from('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' + xml + '</Document></kml>') };
}
try {
 await page.goto('file://' + path.join(root, 'dist', 'Visualizador_KML_OpenFreeMap.html'));
 await page.locator('#totalCount').filter({hasText:'8'}).waitFor();
 const srDesc = '<div class="tabs"><button onclick="openTab(event,\'local\')">Local</button><button onclick="openTab(event,\'fotos\')">Fotos</button></div>' +
   '<div class="tabcontent" id="local"><table><tr><td>Congregações locais</td><td>1</td></tr></table>' +
   '<a href="https://grafico-api.onrender.com/api/grafico?x=999">Abrir gráfico externo</a></div>' +
   '<div class="tabcontent" id="fotos"><img src="https://jwsite.sharepoint.com/sites/ficticio/photo.jpg" alt="Foto fictícia"></div>';
 await page.locator('#upload').setInputFiles(file(point(srDesc,'BRA9901'), 'SRs.kml'));
 await page.waitForFunction(() => document.getElementById('fileName').textContent.trim() === 'SRs.kml');
 assert.equal(await page.locator('body').getAttribute('data-map-profile'),'srs');
 assert.ok(await page.getByText('Como interpretar o mapa SRs').count());
 await page.locator('.result').first().click();
 assert.equal(await page.locator('#detailBody .tabs button').count(),2);
 assert.ok(await page.locator('.chart-external-warning').count(), 'Link Render não pode ser oferecido como gráfico');
 await page.locator('#detailBody .tabs button').nth(1).click();
 assert.equal(await page.locator('.photo-load-button').count(),1);
 assert.equal(await page.locator('.sharepoint-photo').count(),0, 'Fotos não são carregadas sem clique');
 assert.equal(requests.length,0,'Nenhum KML ou URL de gráfico/foto pode acessar a rede automaticamente');
 const vendasDesc='<table><tr><td>Preço de venda</td><td>R$ 100,00</td></tr><tr><td>Área do terreno</td><td>200 m²</td></tr></table>';
 await page.locator('#upload').setInputFiles(file(
   '<Folder><name>Imóvel à venda</name><Folder><name>SR vazio</name>'+point(vendasDesc,'BRA9902')+'</Folder></Folder>',
   'SRs - Vendas.kml'
 ));
 await page.waitForFunction(() => document.getElementById('fileName').textContent.trim() === 'SRs - Vendas.kml');
 assert.equal(await page.locator('body').getAttribute('data-map-profile'),'vendas');
 assert.ok(await page.getByText('Mapa de imóveis à venda').count());
 assert.equal(requests.length,0);
 assert.deepEqual(errors,[]);
 console.log('OK: SRs e Vendas, abas, galeria sob clique, gráfico externo bloqueado, sem rede');
} finally {
 await page.close();
 await browser.close();
}
