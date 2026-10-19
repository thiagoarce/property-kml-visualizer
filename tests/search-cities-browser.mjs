/* Busca local com autocomplete de cidades do próprio KML. Dados inteiramente fictícios. */
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1360,height:880}});
const network=[],errors=[];
page.on('request',r=>{if(/^https?:/i.test(r.url()))network.push(r.url());});
page.on('pageerror',e=>errors.push(e.message));
function placemark(name,city,address,cong,rec,lon,lat){
  const html='<div id="Location"><table><tbody>'+
   '<tr><td><p class="key">Nome do Local de Reunião</p></td><td><p>SP/'+city+'/BRA'+name+'</p></td></tr>'+
   '<tr><td><p class="key">Cidade</p></td><td><p>'+city+'</p></td></tr>'+
   '<tr><td><p class="key">Circuito</p></td><td><p>SP-169</p></td></tr>'+
   '<tr><td><p class="key">Endereço</p></td><td><p>'+address+'</p></td></tr>'+
   '<tr><td><p class="key">Congregação</p></td><td><p>'+cong+'</p></td></tr>'+
   '<tr><td><p class="key">REC</p></td><td><p>'+rec+'</p></td></tr>'+
   '</tbody></table></div>';
  return '<Placemark><name>'+name+'</name><description><![CDATA['+html+']]></description>'+
    '<Point><coordinates>'+lon+','+lat+',0</coordinates></Point></Placemark>';
}
const xml='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
 '<Folder><name>Macro 1</name><Folder><name>REC Campinas, SP 2</name>'+
 placemark('3738','Cerquilho','R. Patativa, 444','Congregação Centro','REC Campinas, SP 2',-47.761855,-23.163336)+
 placemark('3812','Cerquilho','Rua das Palmeiras, 123','Congregação Vila Nova','REC Campinas, SP 2',-47.7632,-23.167)+
 '</Folder></Folder><Folder><name>Macro 2</name>'+
 placemark('9993','Sorocaba','Rua Cerquilho, 90','Congregação Norte','REC Cerquilho / SP',-47.44,-23.51)+
 placemark('9994','São José dos Campos','Rua São Bento, 9','Congregação Central','REC Vale',-45.88,-23.18)+
 '</Folder></Document></kml>';
try{
 await page.goto('file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html'));
 await page.locator('#upload').setInputFiles({name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(xml)});
 await page.waitForFunction(()=>document.querySelector('#fileName')?.textContent==='SRs.kml');
 const search=page.locator('#search');
 await search.fill('cerqui');
 await page.waitForSelector('#searchSuggestions:not([hidden])');
 let city=page.locator('.search-suggestion').filter({hasText:'Cerquilho / SP'});
 assert.equal(await city.count(),1,'Sugerir cidade extraída do popup, não apenas da pasta');
 assert.match(await city.innerText(),/2 imóvel/);
 await page.waitForFunction(()=>document.querySelector('#foundCount').textContent==='3');
 assert.equal(await page.locator('#foundCount').innerText(),'3','Busca textual também encontra rua e REC');
 await city.click();
 assert.equal(await page.locator('#foundCount').innerText(),'2','Clicar na cidade filtra exclusivamente imóveis da cidade');
 assert.equal(await page.locator('.result').count(),2);
 await search.fill('palmeiras');
 await page.waitForFunction(()=>document.querySelector('#foundCount').textContent==='1');
 assert.match(await page.locator('.result').first().innerText(),/3812/,'Endereço interno pesquisável');
 await search.fill('vila nova');
 await page.waitForFunction(()=>document.querySelector('#foundCount').textContent==='1');
 assert.match(await page.locator('.result').first().innerText(),/3812/,'Nome de congregação pesquisável');
 await search.fill('SP-169');
 await page.waitForFunction(()=>document.querySelector('#foundCount').textContent==='2');
 await search.fill('sao jose');
 await page.waitForFunction(()=>document.querySelector('#foundCount').textContent==='1');
 assert.match(await page.locator('.result').first().innerText(),/9994/,'Acentos opcionais');
 await search.fill('cerqu');
 await page.waitForSelector('#searchSuggestions:not([hidden])');
 await search.press('ArrowDown');
 await search.press('Enter');
 assert.equal(await page.locator('#foundCount').innerText(),'2','Seleção por teclado funciona');
 await search.fill('sem resultado mesmo');
 await page.waitForFunction(()=>document.querySelector('#foundCount').textContent==='0');
 await search.fill('');await page.waitForFunction(()=>document.querySelector('#foundCount').textContent==='4');
 assert.deepEqual(network,[],'Pesquisas e autocomplete não usam geocodificação externa');
 assert.deepEqual(errors,[]);
 console.log('OK: Cerquilho city suggestion, address, congregation, circuit, accent, keyboard, privacy');
}finally{await page.close();await browser.close();}
