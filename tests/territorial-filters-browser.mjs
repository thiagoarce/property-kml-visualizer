/* Testa filtros e busca por frase, usando exclusivamente dados fictícios. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
const requests=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
function point(name,lon,lat,count,style) {
 const desc=count===null?'':'<table><tr><td>Congregações locais</td><td>'+count+'</td></tr></table>';
 return '<Placemark><name>'+name+'</name><styleUrl>#'+style+'</styleUrl><description><![CDATA['+desc+']]></description><Point><coordinates>'+lon+','+lat+',0</coordinates></Point></Placemark>';
}
function folder(macro,rec,content) {
 return '<Folder><name>'+macro+'</name><Folder><name>'+rec+'</name>'+content+'</Folder></Folder>';
}
const xml='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
 '<Style id="black"><IconStyle><color>ff000000</color></IconStyle></Style>'+
 '<Style id="blue"><IconStyle><color>ffff0000</color></IconStyle></Style>'+
 folder('Macro 1 (2)','REC SP Teste',
   point('BRA9901 - salao 6',-46.63,-23.55,6,'black')+
   point('BRA9902 - salao 5 ou mais',-46.65,-23.58,null,'black')+
   point('BRA9903 - salao 4',-46.61,-23.59,4,'blue'))+
 folder('Macro 4 (1)','REC PB Teste',point('BRA9904 - salao 7',-34.88,-7.12,7,'black'))+
 '</Document></kml>';
const file={name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(xml,'utf8')};
try {
 await page.goto('file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html'));
 await page.locator('#welcomeScreen').waitFor();
 await page.locator('#upload').setInputFiles(file);
 await page.waitForFunction(()=>document.getElementById('fileName').textContent.trim()==='SRs.kml');
 assert.equal(await page.locator('#stateFilter option[value="SP"]').count(),1);
 assert.equal(await page.locator('#stateFilter option[value="PB"]').count(),1);
 assert.equal(await page.locator('#macroFilter option[value="Macro 1"]').count(),1);
 await page.locator('[data-workspace="filtros"]').click();
 await page.locator('#stateFilter').selectOption('SP');
 await page.locator('#macroFilter').selectOption('Macro 1');
 await page.locator('#congFilter').selectOption('6+');
 await page.locator('#filteredCount').filter({hasText:'2'}).waitFor();
 assert.match(await page.locator('#analysisResult').innerText(),/categoria de cor/);
 await page.locator('#groupBy').selectOption('rec');
 assert.match(await page.locator('#groupStats').innerText(),/REC SP Teste/);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#exportFiltered').click()]);
 assert.match(download.suggestedFilename(),/Mapa_Filtrado.*\.csv/);
 await page.locator('#clearAdvanced').click();
 await page.locator('#filteredCount').filter({hasText:'4'}).waitFor();
 await page.locator('#question').fill('Quais salões com mais de 5 congregações em SP?');
 await page.locator('#askButton').click();
 await page.locator('#filteredCount').filter({hasText:'2'}).waitFor();
 assert.equal(await page.locator('#stateFilter').inputValue(),'SP');
 assert.equal(await page.locator('#congFilter').inputValue(),'6+');
 assert.equal(await page.locator('#propertyFilter').inputValue(),'hall');
 assert.ok((await page.locator('#questionHint').innerText()).includes('Interpretado'));
 assert.equal(requests.length,0);
 assert.deepEqual(errors,[]);
 console.log('OK: UF por poligonos, Macro, REC, 6+ vs 5+, agrupamento, CSV e pergunta local');
} finally {await page.close();await browser.close();}
