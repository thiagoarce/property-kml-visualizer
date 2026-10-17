# Visão de trabalho e mapas-base — edição de interface

O visualizador mantém a distribuição por **um HTML único**, KML/KMZ processado **somente no navegador** e mapa offline por padrão.

## Popup dos imóveis

Nos arquivos SRs e Vendas, a primeira tela é **Visão geral**, com os dados relevantes em badges e cartões. As abas originais do KML aparecem como seções sob demanda, para evitar duplicação e excesso de rolagem. **Fonte original** carrega o HTML sanitizado do Google Earth somente quando o usuário clicar.

Em **Exibição**, o usuário pode desligar **Indicadores do imóvel** ou ativar **Campos sem dados** (ocultos por padrão). Também pode ocultar a legenda, o painel de filtros e o cartão de informações do mapa. **Ocultar filtros / Mostrar filtros** fica no cabeçalho.

Fotos do SharePoint continuam sendo carregadas só mediante ação do usuário, e há link alternativo para login. A API externa de gráficos não é chamada; apenas séries já presentes no KML podem ser desenhadas localmente.

## Cartografia: múltiplos estilos

Selecione **Mapa-base** e marque **Online** para utilizar:

- **Liberty**: ruas e locais, tema padrão do OpenFreeMap;
- **Positron**: claro, pouco ruído, útil para muitos marcadores;
- **Bright**: contraste maior;
- **Dark**: fundo escuro;
- **Satélite Esri (teste)**: serviço **World Imagery** carregado diretamente como tiles raster. É opcional, avisa sobre licença e destino das requisições antes de iniciar. Precisa ser verificado no Edge corporativo e autorizado por TI antes do uso institucional.

Ao desmarcar Online, somente a geometria simplificada dos estados (incorporada) continua visível. As camadas externas só são consultadas após ação do usuário; elas recebem extensão/zoom e IP, **não a lista de BRAs nem as descrições**.

### Fontes e condições

- Estilos OpenFreeMap: https://openfreemap.org/quick_start/ e https://github.com/hyperknot/openfreemap-styles
- Esri World Imagery: https://support.esri.com/en-us/knowledge-base/deprecation-imagery-world-2d-and-streetmap-world-2d-bas-000027382
- Condições Esri: https://www.esri.com/en-us/legal/terms/web-site-service

Esri World Imagery não é Google Maps. Não presumir que o acesso direto seja permanentemente gratuito, licenciado ou funcional em todas as redes. O modo satélite é um experimento sujeito a essas condições.

## Testes

`tests/popup-tiles-browser.mjs` valida painel em abas, campos vazios, visibilidade de seções, ausência de carregamentos automáticos de dados institucionais e inicialização de mapa externo só após interação.
