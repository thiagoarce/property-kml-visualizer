/* HTML dos popups é fictício. Regressão de abas, tabelas e gráficos locais. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:920}});
const errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
const html='<div class="tabs">'+
 '<button onclick="trocarAba(\'sec_local\')">Local</button>'+
 '<button onclick="trocarAba(\'sec_contatos\')">Nomes e Contatos</button>'+
 '<button onclick="trocarAba(\'sec_auditorios\')">Auditórios</button>'+
 '<button onclick="trocarAba(\'sec_congregacoes\')">Congregações</button>'+
 '<button onclick="trocarAba(\'sec_graficos\')">Gráficos e projeções</button>'+
 '<button onclick="trocarAba(\'sec_fotos\')">Fotos</button>'+
 '</div>'+
 '<div id="sec_local" class="tab-content">'+
 '<table><tr><td>WHQ Location Number</td><td>BRA9901</td></tr>'+
 '<tr><td>Cidade</td><td>Recife</td><td>Estado</td><td>PE</td></tr>'+
 '<tr><td>Área do Local</td><td>300,00 m²</td></tr>'+
 '<tr><td>Campo sem dados</td><td></td></tr>'+
 '<tr><td colspan="2">Posse e financeiro</td></tr>'+
 '<tr><td>Tipo de Posse</td><td>Próprio</td></tr>'+
 '<tr><td>Condição do Prédio</td><td>Nenhuma construção/reforma necessária</td></tr></table></div>'+
 '<div id="sec_contatos" class="tab-content"><table><tr><td>Contato</td><td>Contato fictício</td></tr></table></div>'+
 '<div id="sec_auditorios" class="tab-content"><table><tr><td>Capacidade</td><td>250</td></tr></table></div>'+
 '<div id="sec_congregacoes" class="tab-content"><table><tr><th>Congregação</th><th>Assistência</th></tr>'+
 '<tr><td>Fictícia A</td><td>100</td></tr><tr><td>Fictícia B</td><td>90</td></tr></table></div>'+
 '<div id="sec_graficos" class="tab-content"><table><tr><th>Ano</th><th>Assistência</th></tr>'+
 '<tr><td>2024</td><td>160</td></tr><tr><td>2025</td><td>180</td></tr></table></div>'+
 '<div id="sec_fotos" class="tab-content"><img src="https://jwsite.sharepoint.com/sites/ficticio/foto.jpg"></div>';
const xml='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
 '<Placemark><name>BRA9901</name><description><![CDATA['+html+']]></description>'+
 '<Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark></Document></kml>';
try{
 await page.goto('file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html'));
 await page.waitForFunction(() => document.getElementById('totalCount').textContent.trim() === '8');
 await page.locator('#upload').setInputFiles({name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(xml)});
 await page.waitForFunction(()=>document.querySelector('#fileName').textContent.trim()==='SRs.kml');
 await page.locator('.result').first().click();
 assert.equal(await page.locator('.property-nav-tab').count(),8,'Resumo + seis abas + dados originais');
 assert.equal(await page.locator('.property-view:not([hidden])').count(),1);
 assert.equal(await page.locator('.case-alert').count(),0,'Nenhuma reforma necessária não é alerta');
 await page.locator('.property-nav-tab').filter({hasText:'Local'}).click();
 assert.ok(await page.locator('.detail-facts .detail-field').count()>=5);
 assert.equal(await page.locator('.legacy-section .tabs').count(),0,'Nenhuma segunda barra de abas velha');
 assert.equal(await page.locator('.detail-field.field-is-empty').count(),1);
 assert.equal(await page.locator('.detail-field.field-is-empty').first().isVisible(),false);
 assert.match(await page.locator('.detail-group-row').first().innerText(),/Posse e financeiro/);
 await page.locator('.property-nav-tab').filter({hasText:'Congregações'}).click();
 assert.ok(await page.locator('.legacy-section:not([hidden]) .detail-data-table th').count()===2);
 await page.locator('.property-nav-tab').filter({hasText:'Gráficos'}).click();
 assert.ok(await page.locator('.legacy-section:not([hidden]) .local-chart-svg').count(), 'Gráfico anual local deve sobreviver à reorganização');
 await page.locator('.property-nav-tab').filter({hasText:'Fotos'}).click();
 assert.ok(await page.locator('.legacy-section:not([hidden]) .photo-load-button').count());
 assert.equal(external.length,0,'Nenhuma foto carregada antes do clique');
 await page.locator('.property-nav-tab').filter({hasText:'Dados completos'}).click();
 assert.equal(await page.locator('.legacy-source .description').count(),0);
 await page.locator('.legacy-reveal').click();
 assert.ok(await page.locator('.legacy-source .description').count());
 assert.deepEqual(errors,[]);
 console.log('OK: abas detectadas, fichas, tabelas, conteúdo completo opcional, gráfico local e privacidade');
}finally{await page.close();await browser.close();}
