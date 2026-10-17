/* Regressão com dados inteiramente fictícios. Persistência entre reaberturas file:// */
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const external=[],errors=[];
page.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url());});
page.on('pageerror',e=>errors.push(e.message));
const img='https://jwsite.sharepoint.com/sites/ficticio/BRA9901%20-%20Foto%20Manuten%C3%A7%C3%A3o%20%281%29.jpeg';
const legacy='<div class="tabs">'+
'<button onclick="trocarAba(\'local\')">Local</button>'+
'<button onclick="trocarAba(\'fotos\')">Fotos</button>'+
'<button onclick="trocarAba(\'graficos\')">Gráficos e projeções</button></div>'+
'<div id="local" class="tabcontent"><table>'+
'<tr><td>Tipo de Posse</td><td>Alugado</td></tr>'+
'<tr><td colspan="2"><button>Detalhes do Aluguel (caso alugado)</button></td></tr>'+
'<tr><td>Status da Lease</td><td>Ativa</td></tr>'+
'<tr><td>Início do Contrato</td><td>43494</td></tr>'+
'<tr><td>Fim do Contrato</td><td>47349</td></tr>'+
'<tr><td>Status do Local</td><td>Ativo</td></tr></table></div>'+
'<div id="fotos" class="tabcontent"><p>Fotos (1)</p><img src="'+img+'"></div>'+
'<div id="graficos" class="tabcontent"><p>Capacidade primária 80</p>'+
'<p>Assistência base média 30</p><p>Necessários hoje (90%) 34</p></div>';
const kml='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
'<Placemark><name>BRA9901</name><description><![CDATA['+legacy+']]></description>'+
'<Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark></Document></kml>';
async function waitSaved(){
  await page.waitForFunction(async()=>new Promise(resolve=>{
    const req=indexedDB.open('planejamento-ultimo-mapa-v1',1);
    req.onerror=()=>resolve(false);
    req.onsuccess=()=>{
      const db=req.result;const tx=db.transaction('arquivos','readonly');
      const get=tx.objectStore('arquivos').get('ultimo');
      get.onsuccess=()=>{resolve(!!get.result?.file);db.close();};
      get.onerror=()=>{resolve(false);db.close();};
    };
  }),null,{timeout:10000});
}
try{
  const url='file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html');
  await page.goto(url);
  assert.equal(await page.locator('#welcomeScreen').isVisible(),true);
  await page.locator('#upload').setInputFiles({name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(kml)});
  await page.waitForFunction(()=>document.getElementById('fileName').textContent==='SRs.kml');
  await waitSaved();
  assert.equal(await page.locator('#sessionNote').isVisible(),false);
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('fileName').textContent==='SRs.kml',{timeout:15000});
  assert.equal(await page.locator('#welcomeScreen').isVisible(),false,'Deve abrir diretamente o mapa salvo');
  assert.equal(await page.locator('#sessionNote').isVisible(),true,'Aviso da sessão passada');
  assert.match(await page.locator('#sessionText').innerText(),/última sessão.*KMZ mais recente/i);
  await page.locator('.result').first().click();
  await page.locator('.property-nav-tab').filter({hasText:'Local'}).click();
  const rent=page.locator('.legacy-section:not([hidden]) .detail-accordion').first();
  assert.equal(await rent.count(),1,'Aluguel em dropdown');
  assert.equal(await rent.getAttribute('open'),null);
  await rent.locator('summary').click();
  assert.match(await rent.innerText(),/29\/01\/2019/);
  assert.match(await rent.innerText(),/19\/08\/2029/);
  assert.ok(!await rent.innerText().then(t=>t.includes('Status do Local')),'Status do Local permanece fora de aluguel');
  await page.locator('.property-nav-tab').filter({hasText:'Fotos'}).click();
  assert.match(await page.locator('.photo-gallery .photo-caption').innerText(),/Foto Manutenção \(1\)\.jpeg/);
  assert.ok(!await page.locator('.photo-gallery .photo-caption').innerText().then(t=>t.includes('%20')));
  assert.equal(await page.locator('.photo-gallery .sharepoint-photo').count(),0);
  await page.locator('.property-nav-tab').filter({hasText:'Gráficos'}).click();
  assert.equal(await page.locator('.graph-kpis .graph-kpi').count(),3);
  await page.locator('#forgetMap').click();
  await page.locator('#sessionNote').waitFor({state:'hidden'});
  await page.reload();
  assert.equal(await page.locator('#welcomeScreen').isVisible(),true,'Esquecer volta a exigir seleção de arquivo');
  assert.deepEqual(external,[],'Nenhum dado deve ir à rede');
  assert.deepEqual(errors,[]);
  console.log('OK: IndexedDB file://, alerta da sessão, datas, fotos, aluguel, gráficos e esquecer');
}finally{await page.close();await browser.close();}
