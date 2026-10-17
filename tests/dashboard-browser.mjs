/* Dados 100% fictícios: ícones SVG, cor do rótulo, cards e gráfico local. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],externals=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/^https?:/.test(r.url()))externals.push(r.url());});
function input(name,inner){
 return {name,mimeType:'application/vnd.google-earth.kml+xml',
  buffer:Buffer.from('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
  '<Style id="icon1"><IconStyle><color>ff00ff00</color></IconStyle><LabelStyle><color>ff00ffff</color></LabelStyle></Style>'+
  inner+'</Document></kml>')};
}
function place(desc,code='BRA9901'){
 return '<Placemark><name>'+code+'</name><styleUrl>#icon1</styleUrl><description><![CDATA['+desc+
 ']]></description><Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark>';
}
try{
 await page.goto('file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html'));
 await page.locator('#welcomeScreen').waitFor();
 const sr='<div class="tabs"><button onclick="openTab(event,\'local\')">Local</button>'+
  '<button onclick="openTab(event,\'graficos\')">Gráficos e projeções</button></div>'+
  '<div class="tabcontent" id="local"><table>'+
  '<tr><td>Tipo de Posse</td><td>Próprio</td></tr>'+
  '<tr><td>Capacidade</td><td>250</td></tr>'+
  '<tr><td>Uso</td><td>75%</td></tr>'+
  '<tr><td>Casos Aberto</td><td>Pequena Reforma</td></tr></table></div>'+
  '<div class="tabcontent" id="graficos"><table><tr><th>Ano</th><th>Assistência</th></tr>'+
  '<tr><td>2024</td><td>175</td></tr><tr><td>2025</td><td>185</td></tr></table></div>';
 await page.locator('#upload').setInputFiles(input('SRs.kml',place(sr)));
 await page.waitForFunction(()=>document.querySelector('#fileName').textContent.trim()==='SRs.kml');
 assert.equal(await page.locator('body').getAttribute('data-map-profile'),'srs');
 assert.ok(await page.locator('.meaning-group-title').filter({hasText:'FORMATO'}).count());
 assert.ok(await page.locator('.meaning-group-title').filter({hasText:'RÓTULO'}).count());
 const coloredIcon=page.locator('.map-pin-semantic').first();
 assert.ok(await coloredIcon.locator('svg').count(),'Um ícone semântico SVG deve aparecer');
 assert.equal(await coloredIcon.locator('.semantic-code').evaluate(e=>e.style.getPropertyValue('--label-color')),'#ffff00',
  'KML LabelStyle deve determinar a cor do código BRA');
 await page.locator('.result').first().click();
 assert.ok(await page.locator('.property-overview').count());
 assert.ok(await page.locator('.metric-card').count());
 assert.ok(await page.locator('.property-badge').filter({hasText:'Próprio'}).count());
 assert.ok(await page.locator('.metric-card').filter({hasText:'250'}).count());
 assert.ok(await page.locator('.local-chart-svg').count(),'Série anual presente no KML deve renderizar localmente');
 await page.locator('[data-workspace="filtros"]').click();
 await page.locator('#propertyFilter').selectOption('hall');
 await page.locator('#filteredCount').filter({hasText:'1'}).waitFor();
 await page.locator('#upload').setInputFiles(input('SRs - Vendas.kml',
  '<Folder><name>Imóvel à venda</name>'+place('<table><tr><td>Preço de venda</td><td>R$ 200.000,00</td></tr>'+
    '<tr><td>Área do terreno</td><td>600 m²</td></tr></table>','BRA9902')+'</Folder>'));
 await page.waitForFunction(()=>document.querySelector('#fileName').textContent.trim()==='SRs - Vendas.kml');
 assert.equal(await page.locator('body').getAttribute('data-map-profile'),'vendas');
 assert.ok(await page.locator('.meaning-group-title').filter({hasText:'SITUAÇÃO DA VENDA'}).count());
 await page.locator('[data-workspace="locais"]').click();
 await page.locator('.result').first().click();
 assert.ok(await page.locator('.metric-major').filter({hasText:'R$ 200.000,00'}).count());
 assert.equal(externals.length,0);
 assert.deepEqual(errors,[]);
 console.log('OK: perfis SRs e Vendas; legenda semântica; ícones SVG; LabelStyle; cards; gráfico local; zero rede');
}finally{await page.close();await browser.close();}
