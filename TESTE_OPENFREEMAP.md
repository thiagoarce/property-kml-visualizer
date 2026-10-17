# Teste OpenFreeMap — HTML único aberto por duplo clique

**Branch:** feat/openfreemap-file-test. Este experimento não modifica o visualizador da branch original.

## Objetivo
Testar o OpenFreeMap com a interface e o leitor KML já existentes, preservando um único HTML aberto via file://, sem Python nem servidor no PC do usuário final. Leaflet, MapLibre 5 e o adaptador MapLibre/Leaflet são incorporados no arquivo gerado. Os BRAs fictícios e o mapa simplificado do Brasil continuam disponíveis sem internet. Ruas online só são consultadas quando o usuário marca a opção.

## Gerar no seu PC pessoal

```powershell
git fetch origin
git switch feat/openfreemap-file-test
python scripts/build_openfreemap.py
start .\dist\Visualizador_KML_OpenFreeMap.html
```

O Python só é necessário para gerar o HTML. O empacotador baixa apenas bibliotecas públicas via UNPKG, com fallback jsDelivr, e incorpora tudo ao HTML. Não faça commit ou upload de KMLs internos. O empacotador nunca lê um arquivo KML.

Versões fixas: MapLibre GL JS 5.12.0 (BSD-3-Clause) e @maplibre/maplibre-gl-leaflet 0.1.4 (ISC).

## Teste decisivo — NÃO usar localhost

1. Pare o servidor de testes antigo (Ctrl+C).
2. Abra o HTML gerado por dois cliques no Edge: a URL deve começar com file:///.
3. Confira os BRAs fictícios e o mapa offline.
4. Ative **OpenFreeMap (teste)** e aproxime para conferir as ruas.
5. F12 → Rede/Network; filtre por openfreemap e verifique se estilo, tiles .pbf, glyphs e sprites carregam.
6. Se aparecer mapa vazio, confira o Console para erros de CORS, origin null, Web Worker, CSP ou WebGL.
7. Só depois, se falhar, compare com http://localhost:8000/Visualizador_KML_OpenFreeMap.html para saber se a causa é file://.

Esta é uma tentativa técnica, não uma garantia de compatibilidade. O MapLibre 5 foi escolhido porque permite empacotar Web Worker dentro do HTML; a compatibilidade real com file:// precisa ser testada em Edge.

## Privacidade e limites

- O KML e os popups são processados no navegador. O serviço recebe pedidos de cartografia que revelam a área visualizada e o zoom, mas o visualizador não envia tabelas, nomes, assistências ou dados dos marcadores.
- Com ruas desligadas, não existem solicitações de mapas para OpenFreeMap.
- OpenFreeMap não exige chave de API, mas não oferece SLA. A equipe de TI precisa avaliar o provedor para uso institucional.
- A versão original permanece em dist/Visualizador_KML.html. Para voltar: git switch feat/leaflet-single-html.

## Importação de KMZ (experimental)

A edição compilada `Visualizador_KML_OpenFreeMap.html` aceita diretamente arquivos `.kml` e `.kmz`, sem precisar descompactar. Para KMZ, o JSZip 3.10.1 (MIT) está embutido no próprio HTML e só extrai o KML interno, escolhendo prioritariamente `doc.kml`. O XML é interpretado no navegador, sem upload ou serviços de IA.

**Limitação:** anexos dentro do KMZ (fotografias, ícones, overlays e outros recursos) ainda não são exibidos; somente o conteúdo KML interno é interpretado. KML interno ou KMZ acima de 512 MB não são aceitos. Um KMZ compactado pode parecer pequeno, mas a descompactação e o `DOMParser` podem usar muita memória para mapas grandes.

O CI gera um KMZ totalmente fictício a partir de `exemplos/exemplo-ficticio.kml` e verifica a importação via `file://`, sem requisições externas.

