/* Original graph endpoint contract is tested using fictional series and intercepted PNG responses. */
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const requests=[],unexpected=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{
  if(!/^https?:/i.test(r.url()))return;
  if(r.url().startsWith('https://grafico-api.onrender.com/api/grafico?'))requests.push(new URL(r.url()));
  else unexpected.push(r.url());
});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
await page.route('https://grafico-api.onrender.com/api/grafico?**',route=>route.fulfill({status:200,contentType:'image/png',body:png}));
const query=(id)=>new URL('https://grafico-api.onrender.com/api/grafico?'+new URLSearchParams({
  congregacao:id,anos_anuais:'2024,2025,2026',assistencias_anuais:'22,25,30',
  publicadores_anuais:'19,21,23',ano_base:'2026',
  meses:'2026-07,2026-08,2026-09',assistencias_mensais:'27,29,30',
  anos_projecao:'2027,2028',p50:'31,32',p70:'34,36',
  modo:'geral',anual:'1',mensal:'0',media_movel:'0',tend_hist:'1',tend_rec:'0',
  publicadores:'1',p50_visivel:'1',p70_visivel:'0'
}).toString()).href.replace(/&/g,'&amp;');
const card=id=>'<div class="chartCard graphCard" id="graf'+id+'">'+
  '<div class="chartTitle">Congregação fictícia ('+id+')</div>'+
  '<span class="badge">Estável</span><span class="badge">Pequena</span>'+
  '<div class="chartMeta">Inclinação 5 anos: 0,3 | Assistência base: 30 | Ano base: 2026</div>'+
  '<a href="'+query(id)+'" target="_blank"><img class="chartImg" data-base="'+query(id)+'" src="'+query(id)+'"></a>'+
  '</div>';
const raw='<div class="tabs"><button onclick="trocarAba(\'local\')">Local</button>'+
  '<button onclick="trocarAba(\'Graficos\')">Gráficos e projeções</button></div>'+
  '<div id="local" class="tabcontent"><p>Dados fictícios</p></div>'+
  '<div id="Graficos" class="tabcontent">'+
  '<div class="seatPanel"><div class="metricCard"><div class="metricLabel">Capacidade primária</div><div class="metricValue">80</div></div>'+
  '<div class="metricCard"><div class="metricLabel">Assistência base média</div><div class="metricValue">30</div></div>'+
  '<div class="statusBox">Capacidade adequada para o cenário presencial</div></div>'+
  card('90001')+card('90002')+
  '<div class="graphFooter"><div id="graphCalcPanel"><table><tr><td>P50 excede (presencial)</td><td>Não excede</td></tr></table>'+
  '<p class="smallNote">Projeções estimadas</p></div></div>'+
  '</div>';
const xml='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
  '<Placemark><name>BRA9901</name><description><![CDATA['+raw+']]></description>'+
  '<Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark></Document></kml>';
try {
  await page.goto('file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html'));
  await page.locator('#upload').setInputFiles({name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(xml)});
  await page.waitForFunction(()=>document.getElementById('fileName').textContent==='SRs.kml');
  await page.locator('.result').first().click();
  await page.locator('.property-nav-tab').filter({hasText:'Gráficos'}).click();
  const panel=page.locator('.legacy-section:not([hidden])');
  assert.equal(await panel.locator('.api-graph-card').count(),2);
  assert.equal(await panel.locator('.graph-comparison').count(),0,'Não recriar gráficos inventados');
  assert.equal(requests.length,0,'Nunca enviar séries históricas sem clique');
  assert.equal(await panel.locator('.api-graph-image[src]').count(),0);
  await panel.locator('.api-graph-load').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.api-graph-image')].every(n=>n.complete&&n.naturalWidth>0));
  assert.equal(requests.length,2);
  assert.deepEqual(requests.map(url=>url.searchParams.get('congregacao')).sort(),['90001','90002']);
  assert.equal(requests[0].searchParams.get('assistencias_anuais'),'22,25,30');
  assert.equal(requests[0].searchParams.get('modo'),'geral');
  await panel.locator('.api-graph-preset[data-mode="recente"]').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.api-graph-image')].every(n=>n.complete&&n.naturalWidth>0));
  assert.equal(requests.length,4);
  assert.equal(requests[2].searchParams.get('modo'),'recente');
  assert.equal(requests[2].searchParams.get('anual'),'0');
  assert.equal(requests[2].searchParams.get('mensal'),'1');
  assert.equal(requests[2].searchParams.get('media_movel'),'1');
  assert.equal(requests[2].searchParams.get('tend_rec'),'1');
  await panel.locator('.api-graph-preset[data-mode="detalhado"]').click();
  assert.equal(requests.length,6);
  assert.equal(requests[4].searchParams.get('modo'),'detalhado');
  assert.equal(requests[4].searchParams.get('p70_visivel'),'1');
  await panel.locator('.api-graph-options label').filter({hasText:'Mensal'}).locator('input').uncheck();
  await panel.locator('.api-graph-apply').click();
  assert.equal(requests.length,8);
  assert.equal(requests[6].searchParams.get('mensal'),'0');
  assert.equal(await panel.locator('.api-graph-calculations').getAttribute('open'),null);
  assert.deepEqual(unexpected,[]);
  assert.deepEqual(errors,[]);
  console.log('OK: two real API URLs, explicit permission click, presets, series flags and calculation accordions');
}finally{await page.close();await browser.close();}
