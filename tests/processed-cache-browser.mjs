/* Confirma cache pronto, alteração de filtros e restauração de ícones sem reabrir XML. */
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
await page.addInitScript(()=>{
  window.__xmlParses=0;
  const old=DOMParser.prototype.parseFromString;
  DOMParser.prototype.parseFromString=function(src,type){
    if(type==='application/xml')window.__xmlParses++;
    return old.call(this,src,type);
  };
});
async function get(key='ultimo'){
  return page.evaluate(key=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('planejamento-ultimo-mapa-v1',1);
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const db=req.result,tx=db.transaction('arquivos','readonly'),get=tx.objectStore('arquivos').get(key);
      get.onsuccess=()=>{resolve(get.result);db.close();};
      get.onerror=()=>reject(get.error);
    };
  }),key);
}
async function waitForStored(key,predicate,timeout=20000){
  const begin=Date.now();
  while(Date.now()-begin<timeout){
    const value=await get(key);
    if(predicate(value))return value;
    await page.waitForTimeout(120);
  }
  throw new Error('Timed out waiting for IndexedDB entry: '+key);
}
const xml='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
  '<Folder><name>Macro 4</name><Placemark><name>BRA9901</name>'+
  '<Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark>'+
  '<Placemark><name>BRA9902</name><Point><coordinates>-46.63,-23.55,0</coordinates></Point>'+
  '</Placemark></Folder></Document></kml>';
try{
  const url='file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html');
  await page.goto(url);
  await page.locator('#upload').setInputFiles({name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(xml)});
  await page.locator('#totalCount').filter({hasText:'2'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__xmlParses),1);
  await waitForStored('ultimo',r=>r?.processed?.schema===2&&r.processed.features.length===2);
  const record=await get();
  assert.equal(record.processed.features.length,2);
  assert.equal(record.processed.features[0].marker,undefined,'Leaflet marker cannot be stored');
  await page.locator('.result').first().click();
  await page.locator('#search').fill('BRA9901');
  await page.locator('[data-workspace="filtros"]').click();
  await waitForStored('vista',v=>v?.search==='BRA9901'&&v.workspace==='filtros'&&v.zoom>=12);
  await page.reload();
  await page.locator('#sessionNote').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__xmlParses),0,'Reabertura deve usar dados já interpretados');
  assert.equal(await page.locator('#search').inputValue(),'BRA9901');
  assert.equal(await page.locator('#filteredCount').innerText(),'1');
  assert.equal(await page.locator('#territoryPanel').isVisible(),true);
  assert.match(await page.locator('#sessionText').innerText(),/Mapa restaurado da última sessão/);
  assert.equal(await page.locator('#osmToggle').isChecked(),false);
  await page.locator('#forgetMap').click();
  await page.locator('#sessionNote').waitFor({state:'hidden'});
  await page.reload();
  assert.equal(await page.locator('#welcomeScreen').isVisible(),true);
  assert.equal(await get('vista'),undefined);
  await page.locator('#upload').setInputFiles(path.join(root,'exemplos','estilos-ficticios.kmz'));
  await page.locator('#fileName').filter({hasText:'estilos-ficticios.kmz'}).waitFor();
  await waitForStored('ultimo',r=>r?.processed?.schema===2&&r.processed.iconBlobs?.length>0);
  const kmz=await get();
  assert.ok(kmz.processed.features.some(f=>Number.isInteger(f.cachedIcon)));
  await page.reload();
  await page.locator('#sessionNote').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__xmlParses),0);
  assert.ok(await page.locator('.result-dot img').count()>0,'Icone armazenado deve voltar ao abrir o mapa');
  assert.deepEqual(errors,[]);
  assert.deepEqual(network,[]);
  console.log('OK: cache sem XML, zoom/filtros, exclusão total e ícone KMZ preservado');
}finally{await page.close();await browser.close();}
