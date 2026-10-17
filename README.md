# Property KML Visualizer

Visualizador de arquivos KML que funciona **localmente no navegador**, sem instalar software no computador do usuário.

## Baixar e usar

1. Abra [`dist/Visualizador_KML.html`](dist/Visualizador_KML.html) no GitHub e escolha **Download raw file**.
2. Salve e abra com dois cliques no Microsoft Edge.
3. Clique em **Abrir KML** e selecione o arquivo local, ou arraste-o para a caixa pontilhada.

O arquivo HTML **contém JavaScript, CSS, Leaflet e MarkerCluster embutidos**. Não depende de Python, Node, CDN, servidor ou internet para abrir a interface e ler os marcadores. **O mapa vetorial offline do Brasil, com os limites das 27 UFs, está embutido e abre automaticamente.** As ruas OpenStreetMap são uma opção experimental e exigem conexão.

[Arquivo KML de teste inteiramente fictício](exemplos/exemplo-ficticio.kml).

## Privacidade e segurança

**Este repositório é PÚBLICO. Nunca envie KMLs reais, planilhas internas, assistências, nomes, fotos, documentos, credenciais ou informações de locais institucionais ao GitHub, issues, pull requests ou ferramentas não aprovadas.**

- O usuário abre o arquivo KML com o seletor de arquivos local. Seu conteúdo é analisado com `DOMParser` **no navegador**, sem `fetch` ou `POST` dos dados.
- **Ao abrir o HTML, nenhuma requisição externa é feita.** O mapa-base vem de GeoJSON público do IBGE incorporado ao HTML. Só quando a opção Ruas online é ativada, o serviço usado é `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. O servidor recebe **área visível, zoom e metadados normais da conexão**, mas não a lista de marcadores, tabelas ou conteúdo do KML.
- **Ruas online (teste)** fica desligado inicialmente. Os marcadores e os 27 limites estaduais permanecem visíveis offline; quando a camada externa dá erro, o visualizador volta à base vetorial.
- O conteúdo HTML encontrado dentro de `<description>` é convertido para elementos seguros: scripts, formulários, iframes e outras incorporações são descartados; imagens remotas são substituídas por links que dependem de clique.
- O HTML aplica uma **Content Security Policy** para impedir conexões externas via código e só permite imagens do servidor de tiles OSM.
- Links externos presentes no KML podem ser abertos **por decisão do usuário**. Não são automaticamente carregados.
- Não possui telemetria, Analytics, serviços de IA, armazenamento remoto ou mecanismos automáticos de atualização.
- Não pressupõe que o repositório público seja um local autorizado para dados internos.

**Atenção à política do OpenStreetMap:** as requisições originadas de páginas locais `file://` podem não enviar um cabeçalho Referer permitido. O servidor público de tiles pode recusá-las. O projeto não contorna esse bloqueio. Caso o ambiente corporativo exija mapa-base garantido, avalie um provedor de tiles expressamente autorizado ou um pacote cartográfico offline.

## Desenvolvimento (apenas quem mantém o projeto)

```bash
python scripts/build.py
```

Isso compila `src/index.html`, `src/app.css`, `src/app.js` e as bibliotecas versionadas em `vendor/` em um **único HTML** em `dist/`. O usuário final **não executa** esse comando.

### Organização

- `src/`: código-fonte editável, incluindo `brazil-states.js` com geometrias públicas CC0 obtidas do IBGE via [br-geojson](https://github.com/henriquemalvar/br-geojson).
- `vendor/`: Leaflet 1.9.4 e Leaflet.markercluster 1.5.3, bibliotecas empacotadas com suas licenças.
- `scripts/build.py`: empacotador estático.
- `dist/Visualizador_KML.html`: arquivo final para usuários leigos.
- `exemplos/`: dados fictícios para teste.

## Limitações conhecidas desta fase

- Aceita `.kml`, não `.kmz`.
- Os marcadores Point e linhas são lidos; polígonos complexos, imagens, KML com redes, `gx:Track` e recursos dinâmicos são trabalhos futuros.
- Os balões ricos do Google Earth não são executados como código. Tabelas, textos e algumas estruturas simples de abas são adaptadas. Gráficos Javascript originais precisam de implementação separada.
- Mapas grandes podem consumir memória local; existe agrupamento de marcadores e limite de listagem.
- Cabeçalhos de codificação e arquivos legados ANSI são tratados por um fallback Windows-1252.
- O mapa vetorial é propositalmente simples: limites estaduais sem ruas, logradouros, relevo ou imagens de satélite.
- Políticas de segurança do Edge, da rede corporativa e do OpenStreetMap precisam ser validadas no ambiente de destino.

## Licenças

Leaflet 1.9.4 © Volodymyr Agafonkin e colaboradores, BSD-2-Clause.
Leaflet.markercluster 1.5.3 © Dave Leaver e colaboradores, MIT.
Veja `THIRD_PARTY_NOTICES.md` e os projetos oficiais para as licenças completas.
