/* Regressão de gráficos com dados fictícios: nunca chama a API antiga. */
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
const legacy=(withHistory)=>'<div class="tabs">'+
 '<button onclick="trocarAba(\'local\')">Local</button>'+
 '<button onclick="trocarAba(\'graficos\')">Gráficos e projeções</button></div>'+
 '<div class="tabcontent" id="local"><p>Local fictício</p></div>'+
 '<div class="tabcontent" id="graficos">'+
 '<h3>Capacidade do auditório</h3><p>Capacidade primária<br>80<br>Assistência base média<br>30<br>'+
 'Necessários hoje (90%)<br>34<br>Com até 20% remoto<br>27</p>'+
 '<p>Histórico e projeções por congregação<br>Congregação fictícia (999)<br>'+
 'Inclinação 5 anos: 0,3 | Assistência base: 30 | Ano base: 2026</p>'+
 '<h3>Configuração de todas as congregações</h3><p>Anual Mensal Média móvel Tendência histórica Tendência recente</p>'+
 (withHistory?'<table><tr><th>Ano</th><th>Assistência</th></tr>'+
 '<tr><td>2023</td><td>20</td></tr><tr><td>2024</td><td>26</td></tr>'+
 '<tr><td>2025</td><td>30</td></tr></table>':'')+
 '<a href="https://grafico-api.onrender.com/grafico?bra=BRA9999">Gráfico original</a></div>';
const xml=withHistory=>'<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+
 '<Placemark><name>BRA9999</name><description><![CDATA['+legacy(withHistory)+']]></description>'+
 '<Point><coordinates>-34.88,-8.05,0</coordinates></Point></Placemark></Document></kml>';
try{
  await page.goto('file://'+path.join(root,'dist','Visualizador_KML_OpenFreeMap.html'));
  for(const hasHistory of [false,true]){
    await page.locator('#upload').setInputFiles({name:'SRs.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(xml(hasHistory))});
    await page.waitForFunction(()=>document.getElementById('fileName').textContent==='SRs.kml');
    await page.locator('.result').first().click();
    await page.locator('.property-nav-tab').filter({hasText:'Gráficos'}).click();
    const section=page.locator('.legacy-section:not([hidden])');
    assert.equal(await section.locator('.graph-kpi').count(),4,'Quatro indicadores sem repetir o bloco original');
    assert.equal(await section.locator('.graph-comparison .graph-bar-row').count(),4);
    assert.match(await section.locator('.graph-occupancy').innerText(),/37,5%/);
    assert.equal(await section.locator('.graph-source').getAttribute('open'),null);
    assert.equal(await section.getByText('Configuração de todas as congregações').isVisible(),false);
    assert.equal(await section.locator('.local-chart-svg').count(),hasHistory?1:0,
      'Série histórica somente se existirem anos no KML');
    if(!hasHistory){
      assert.match(await section.locator('.graph-notice').innerText(),/Séries históricas completas/);
    }
    await section.locator('.graph-source summary').click();
    assert.ok(await section.getByText('Configuração de todas as congregações').isVisible());
    assert.equal(await section.locator('button').count(),0,'Sem botões legados inertes');
  }
  assert.deepEqual(external,[],'Nenhuma requisição à API de gráficos nem ao SharePoint');
  assert.deepEqual(errors,[]);
  console.log('OK: comparativo de capacidade, fonte recolhida, gráfico histórico condicional e privacidade');
}finally{await page.close();await browser.close();}
