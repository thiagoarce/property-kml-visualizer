/* Fluxo de entrada, filtros unificados e componentes do popup — exclusivamente fictício. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const network=[],errors=[];
page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
page.on('pageerror',e=>errors.push(e.message));
const body='<div class="tabs">'+
'<button onclick="trocarAba(\'local\')">Local</button>'+
'<button onclick="trocarAba(\'graficos\')">Gráficos e projeções</button>'+
'<button onclick="trocarAba(\'fotos\')">Fotos</button></div>'+
'<div id="local" class="tabcontent"><table>'+
'<tr><td>Tipo de Posse</td><td>Próprio</td></tr>'+
'<tr><td colspan="2"><button>Detalhes do Aluguel</button></td></tr>'+
'<tr><td>Início do contrato</td><td>2025</td></tr>'+
'<tr><td colspan="2">Identificação do local</td></tr>'+
'<tr><td>Área do terreno</td><td>200 m²</td></tr></table></div>'+
'<div id="graficos" class="tabcontent"><p>Capacidade primária 250<br>Assistência base média 180<br>Necessários hoje (90%) 200</p>'+
'<button>Ajustar gráficos</button><button>Padrão</button>'+
'<a href="https://grafico-api.onrender.com/grafico?x=123">Gráfico</a></div>'+
'<div id="fotos" class="tabcontent"><img src="https://jwsite.sharepoint.com/sites/ficticio/foto1.jpg">'+
'<img src="https://jwsite.sharepoint.com/sites/ficticio/foto2.jpg"></div>';
const kml='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
'<Placemark><name>BRA9901</name><description><![CDATA['+body+']]></description>'+
'<Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark></Document></kml>';
try {
 await page.goto('file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html'));
 assert.equal(await page.locator('#welcomeScreen').isVisible(),true);
 assert.equal(await page.locator('.layout').isVisible(),false);
 assert.equal(await page.locator('#welcomeDrop').isVisible(),true);
 assert.equal(await page.locator('#demoButton').count(),0);
 assert.equal(await page.locator('.privacy').count(),0);
 assert.equal(network.length,0);
 await page.locator('#upload').setInputFiles({name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(kml)});
 await page.waitForFunction(()=>document.getElementById('fileName').textContent.trim()==='SRs.kml');
 assert.equal(await page.locator('#welcomeScreen').isVisible(),false);
 assert.equal(await page.locator('#loadingScreen').isVisible(),false);
 assert.equal(await page.locator('#currentMapName').innerText(),'SRs.kml');
 assert.equal(await page.locator('#mapLegend').isVisible(),false,'Legenda fica na barra lateral');
 await page.locator('[data-workspace="legenda"]').click();
 assert.equal(await page.locator('#mapLegend').isVisible(),true);
 assert.equal(await page.locator('#territoryPanel').isVisible(),false);
 await page.locator('[data-workspace="filtros"]').click();
 assert.equal(await page.locator('#territoryPanel').isVisible(),true);
 assert.equal(await page.locator('#mapLegend').isVisible(),false);
 await page.locator('[data-workspace="locais"]').click();
 await page.locator('.result').first().click();
 await page.locator('.property-nav-tab').filter({hasText:'Local'}).click();
 const accordion=page.locator('.detail-accordion').first();
 assert.ok(await accordion.count(),'Aluguel deve ser expandível');
 assert.equal(await accordion.getAttribute('open'),null);
 await accordion.locator('summary').click();
 assert.ok(await accordion.getAttribute('open')!==null);
 await page.locator('.property-nav-tab').filter({hasText:'Gráficos'}).click();
 assert.equal(await page.locator('.graph-kpis .graph-kpi').count(),3);
 assert.equal(await page.locator('.legacy-section:not([hidden]) button').count(),0);
 assert.equal(await page.locator('.graph-notice').count(),1);
 await page.locator('.property-nav-tab').filter({hasText:'Fotos'}).click();
 assert.equal(await page.locator('.photo-gallery .photo-action').count(),2);
 assert.ok(await page.locator('.gallery-load').isVisible());
 assert.equal(await page.locator('.sharepoint-photo').count(),0);
 assert.equal(network.length,0);
 assert.deepEqual(errors,[]);
 console.log('OK: onboarding, abas da barra, acordeão, gráficos sem botões inertes, galeria privada');
} finally {await page.close();await browser.close();}
