# Property KML Visualizer

Visualizador de arquivos KML que funciona **localmente no navegador**, sem instalar software no computador do usuário.

## Baixar e usar

1. Para usar **KML ou KMZ**, abra [GitHub Actions](../../actions/workflows/build-openfreemap.yml), selecione uma execução bem-sucedida na branch `main` e baixe o artefato `Visualizador-KML-OpenFreeMap-file-test`.
2. Extraia o arquivo HTML do ZIP e abra com dois cliques no Microsoft Edge.
3. Na tela inicial, selecione um KML/KMZ local ou arraste o arquivo para a área de importação.
4. Ao abrir novamente o mesmo HTML no mesmo perfil do navegador, o último arquivo salvo será restaurado automaticamente quando o IndexedDB estiver disponível. Um aviso discreto lembra que talvez exista um KMZ mais recente; **Trocar arquivo** substitui o mapa e **Esquecer** apaga a cópia salva, mantendo o mapa atual aberto.

A edição simplificada [`dist/Visualizador_KML.html`](dist/Visualizador_KML.html) também pode ser aberta por duplo clique, mas **não inclui JSZip/KMZ nem as bibliotecas OpenFreeMap**.

O HTML distribui JavaScript, CSS, Leaflet e bibliotecas cartográficas incorporadas, sem precisar instalar Python, Node ou servidor. A tela inicial só solicita um arquivo; após a importação, o mapa vetorial do Brasil (27 UFs) funciona offline. Camadas externas OpenFreeMap e imagens Esri são opcionais e exigem conexão; selecioná-las transmite ao provedor apenas os dados usuais de requisição de tiles, como área visível e zoom.

[Arquivo KML de teste inteiramente fictício](exemplos/exemplo-ficticio.kml).

## Privacidade e segurança

**Este repositório é PÚBLICO. Nunca envie KMLs reais, planilhas internas, assistências, nomes, fotos, documentos, credenciais ou informações de locais institucionais ao GitHub, issues, pull requests ou ferramentas não aprovadas.**

- O usuário abre o arquivo KML com o seletor de arquivos local. Seu conteúdo é analisado com `DOMParser` **no navegador**, sem `fetch` ou `POST` dos dados.
- **Ao abrir o HTML, nenhuma requisição externa é feita.** A cartografia local usa geometrias estaduais públicas incorporadas. Só ao ativar uma camada online OpenFreeMap/Esri são solicitados tiles de fundo; os provedores recebem localização visualizada, zoom e metadados de conexão, mas não a lista de marcadores nem o conteúdo dos popups.
- As camadas online ficam desligadas inicialmente; marcadores e os 27 limites estaduais permanecem utilizáveis sem conexão.
- O conteúdo HTML encontrado dentro de `<description>` é convertido para elementos seguros: scripts, formulários, iframes e outras incorporações são descartados; imagens remotas são substituídas por links que dependem de clique.
- O HTML aplica uma **Content Security Policy** para impedir conexões externas via código e só permite imagens do servidor de tiles OSM.
- Links externos presentes no KML podem ser abertos **por decisão do usuário**. Não são automaticamente carregados.
- Não possui telemetria, Analytics, serviços de IA, armazenamento remoto ou mecanismos automáticos de atualização.
- **Persistência local:** a versão atual grava uma cópia do último KML/KMZ no IndexedDB do perfil do navegador para reabertura automática. Isso inclui os dados internos do arquivo, que permanecem **armazenados no próprio computador**, não apenas em memória temporária. A opção **Esquecer** remove essa cópia. Limpar os dados do site/perfil do navegador também a remove; navegadores corporativos podem bloquear esse recurso.
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

- A edição OpenFreeMap distribuída no GitHub Actions aceita `.kml` e `.kmz`, inclusive ícones locais referenciados; a edição simplificada aceita apenas `.kml`.
- Os marcadores Point e linhas são lidos; polígonos complexos, imagens, KML com redes, `gx:Track` e recursos dinâmicos são trabalhos futuros.
- O HTML dos balões é sanitizado e adaptado em abas, fichas, tabelas, fotos e gráficos locais quando o KML possui séries disponíveis. Scripts do Google Earth não são executados; gráficos legados sem dados suficientes não são inventados.
- Mapas grandes podem consumir memória local; existe agrupamento de marcadores e limite de listagem.
- Cabeçalhos de codificação e arquivos legados ANSI são tratados por um fallback Windows-1252.
- O mapa vetorial é propositalmente simples: limites estaduais sem ruas, logradouros, relevo ou imagens de satélite.
- Políticas de segurança do Edge, da rede corporativa e do OpenStreetMap precisam ser validadas no ambiente de destino.

## Licenças

Leaflet 1.9.4 © Volodymyr Agafonkin e colaboradores, BSD-2-Clause.
Leaflet.markercluster 1.5.3 © Dave Leaver e colaboradores, MIT.
Veja `THIRD_PARTY_NOTICES.md` e os projetos oficiais para as licenças completas.
