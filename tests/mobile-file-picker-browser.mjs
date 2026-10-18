/* Testa o seletor nativo em tela touch, sem depender de .click() no input oculto. */
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({
  viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3
});
const page=await context.newPage();
const errors=[],remote=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
const makeKml=name=>'<?xml version="1.0" encoding="UTF-8"?>'+
  '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>'+name+'</name>'+
  '<Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark></Document></kml>';
try{
  await page.goto('file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html'));
  assert.ok(await page.locator('#welcomeDrop').isVisible());
  const hit=await page.locator('#welcomeUpload').evaluate(input=>{
    const r=input.getBoundingClientRect();
    const n=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {hit:n===input,display:getComputedStyle(input).display,hidden:input.hidden,
      width:r.width,height:r.height};
  });
  assert.equal(hit.hit,true,'O toque alcança o input nativo, não um botão intermediário');
  assert.ok(hit.width>150&&hit.height>100);
  assert.equal(hit.hidden,false);
  const choose=page.waitForEvent('filechooser',{timeout:10000});
  await page.locator('#welcomeDrop').tap();
  const picker=await choose;
  await picker.setFiles({name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(makeKml('BRA9901'))});
  await page.waitForFunction(()=>document.querySelector('#fileName').textContent==='SRs.kml');
  assert.equal(await page.locator('#totalCount').innerText(),'1');
  assert.equal(await page.locator('#welcomeScreen').isVisible(),false);
  assert.ok(await page.locator('#openButton').isVisible());
  const chooseAgain=page.waitForEvent('filechooser',{timeout:10000});
  await page.locator('#openButton').tap();
  const pickerAgain=await chooseAgain;
  await pickerAgain.setFiles({name:'Vendas.kmz',mimeType:'application/vnd.google-earth.kmz',buffer:Buffer.from('Not a real zip')});
  // Teste de seleção de extensão KMZ: arquivo inválido deve produzir erro
  // informativo, sem bloquear o seletor ou modificar o mapa existente.
  await page.waitForFunction(()=>document.querySelector('#welcomeError').textContent.includes('Não foi possível abrir'));
  assert.equal(await page.locator('#fileName').innerText(),'SRs.kml');
  assert.deepEqual(errors,[]);
  assert.deepEqual(remote,[]);
  console.log('OK: touch native welcome picker, swap picker, unrestricted KMZ and local processing');
}finally{await page.close();await browser.close();}
