/* Testa a limpeza do popup, visibilidade por seção e mapas-base usando KML fictício. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],external=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
await page.route('https://tiles.openfreemap.org/**',route=>route.abort());
await page.route('https://services.arcgisonline.com/**',route=>route.abort());
const desc='<div class="tabs">'+
 '<button onclick="openTab(event,\'local\')">Local</button>'+
 '<button onclick="openTab(event,\'fotos\')">Fotos</button>'+
 '</div><div class="tabcontent" id="local"><table>'+
 '<tr><td>Tipo de Posse</td><td>Próprio</td></tr>'+
 '<tr><td>Capacidade</td><td>240</td></tr>'+
 '<tr><td>Campo antigo vazio</td><td></td></tr>'+
 '</table></div><div class="tabcontent" id="fotos"><p>Galeria fictícia</p></div>';
const xml='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
 '<Placemark><name>BRA9901</name><description><![CDATA['+desc+']]></description>'+
 '<Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark></Document></kml>';
try{
 await page.goto('file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html'));
 await page.waitForFunction(() => document.getElementById('totalCount').textContent.trim() === '8');
 assert.equal(external.length,0,'Não pode carregar qualquer mapa remoto sem clique');
 await page.locator('#upload').setInputFiles({name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(xml)});
 await page.waitForFunction(()=>document.getElementById('fileName').textContent.trim()==='SRs.kml');
 await page.locator('.result').first().click();
 assert.equal(await page.locator('.property-nav-tab').count(),4);
 assert.equal(await page.locator('.property-view:not([hidden])').count(),1);
 assert.ok(await page.locator('.property-overview').isVisible());
 assert.equal(await page.locator('.legacy-section').first().isVisible(),false);
 await page.locator('.property-nav-tab').filter({hasText:'Local'}).click();
 assert.equal(await page.locator('.property-overview').isVisible(),false);
 assert.ok(await page.locator('.legacy-section').first().isVisible());
 assert.equal(await page.locator('.field-is-empty').count(),1);
 assert.equal(await page.locator('.field-is-empty').first().isVisible(),false,'Campos vazios ocultos por padrão');
 await page.locator('#displayMenu summary').click();
 await page.locator('#showEmptyFields').check();
 assert.ok(await page.locator('.field-is-empty').first().isVisible(),'Usuário pode revelar campos vazios');
 await page.locator('[data-workspace="legenda"]').click();
 assert.equal(await page.locator('#mapLegend').isVisible(),true);
 await page.locator('#showLegend').uncheck();
 assert.equal(await page.locator('#mapLegend').isVisible(),false);
 await page.locator('#showMapStatus').uncheck();
 assert.equal(await page.locator('.map-status').isVisible(),false);
 await page.locator('#showSidebar').uncheck();
 assert.equal(await page.locator('.sidebar').isVisible(),false);
 await page.locator('#sidebarToggle').click();
 assert.equal(await page.locator('.sidebar').isVisible(),true);
 await page.locator('#showMetrics').uncheck();
 await page.locator('.property-nav-tab').filter({hasText:'Visão geral'}).click();
 assert.equal(await page.locator('.metric-grid').isVisible(),false);
 await page.locator('.property-nav-tab').filter({hasText:'Dados completos'}).click();
 await page.locator('.legacy-reveal').click();
 assert.ok(await page.locator('.legacy-source .description .tabs').count(),'Estrutura original permanece acessível sob solicitação');
 assert.equal(external.length,0);
 await page.locator('#mapStyle').selectOption('positron');
 assert.equal(await page.locator('#osmToggle').isChecked(),true);
 assert.ok(external.some(x=>x.includes('tiles.openfreemap.org/styles/positron')));
 page.on('dialog',d=>d.accept());
 await page.locator('#mapStyle').selectOption('satellite');
 await page.waitForFunction(()=>document.getElementById('statusTitle').textContent.includes('Esri'));
 await page.waitForTimeout(400);
 assert.ok(external.some(x=>x.includes('services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/')));
 assert.deepEqual(errors,[]);
 console.log('OK: popup sem duplicação, abas, fonte sob demanda, campos ocultos, painel/legenda e estilos/Esri opcionais');
}finally{await page.close();await browser.close();}
