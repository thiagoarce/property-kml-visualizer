# Evolução do visualizador — SRs e Vendas

Status: contrato funcional proposto, **não** implica que gráficos, fotos ou ícones oficiais já estejam implementados.

## Princípio

O HTML é distribuído como um único arquivo aberto por duplo clique. Os arquivos KML/KMZ são lidos localmente, sem upload. Os dados institucionais não podem ser transmitidos a terceiros. A cartografia externa só carrega tiles por ação do usuário e expõe apenas localização visualizada e zoom.

A aplicação tem **perfis de exibição**, mas mantém um parser KML/KMZ compartilhado:

1. **SRs**: `SRs.kml` / `SRs.kmz` → local, contatos, auditórios, congregações, gráficos e projeções, fotos.
2. **Vendas**: `SRs - Vendas.kml`, `SRs - Vendas.kmz` ou equivalentes → resumo comercial, imóvel, localização, fotos e documentos.
3. **Genérico**: assembleias, congressos e outros KMLs → balão/tabulação sanitizados, sem falsas interpretações de negócio.

O perfil deve ser detectado por filename e *estrutura do KML*; na dúvida exibir como genérico.

## Semântica dos SRs — definição já confirmada

- **Cor do ícone / marcador**: quantidade de congregações que usam o prédio.
- **Cor do RÓTULO do ponto**: natureza/condição do caso, sistema distinto da cor do marcador:
  - **Vermelho**: Grandes Projetos.
  - **Ciano/azul-claro**: Pequena Reforma.
  - **Cinza**: Aluguel.
  - **Branco/verde**: locais sem caso prioritário, de acordo com a condição.
- **Formato do ícone**: categoria do imóvel, a confirmar na tabela original do VBA/KML (próprio, alugado, propriedade, residência ou outro). Não presumir a equivalência apenas pela geometria do SVG.
- Hierarquia: **SRs → Macro → REC → local**, incluindo `A tratar`, Propriedades e Residências quando existentes.
- A cor do rótulo tem prioridade visual **Grandes Projetos > Pequena Reforma > Aluguel** quando há múltiplos casos.

**Pendente obrigatório antes de batizar ícones individualmente:** ler tabela exata de **número de congregações → cor (RGB/KML)**, **categoria → forma/href** e **condição sem projeto → rótulo branco/verde** no gerador VBA; não está especificada neste repositório. O visualizador deverá usar uma tabela de domínio testada, não um classificador aproximado por `styleUrl`.

A legenda deve comunicar **quantidade de congregações**, **natureza do imóvel** e **prioridade**, com seus códigos visuais separados. Contadores e filtros devem operar sobre dados de cada BRA, não sobre nomes técnicos de estilos.

## Semântica do mapa de Vendas

Aproveitar a hierarquia e categorias explícitas nas pastas do KML, por exemplo **Imóvel à venda**, **SR em uso** e **SR vazio**. Não extrapolar cores ou categorias sem consultar a função `MapaVendas` e estilos na planilha VBA. A legenda deve explicar status e tipo do imóvel com os ícones realmente usados pelo gerador.

O popup precisa priorizar:
- Código/BRA e cidade/UF;
- **Preço de venda**, tipo de posse, áreas e condições;
- situação (SR vazio, em uso etc.), REC/responsável quando disponível;
- endereço e links corporativos/externos informados;
- fotos e documentos.

Mostrar "não informado" somente quando a fonte não trouxe o valor. Nunca simular dados.

## Contrato de interface — popup SRs

- Cabeçalho estável com identificador **BRA**, Macro / REC e informações principais.
- Abas: **Local**, **Nomes e Contatos**, **Auditórios**, **Congregações**, **Gráficos e projeções**, **Fotos**.
- Manter ações úteis (abrir pasta e imagens no SharePoint), com autenticação do usuário, sem armazenar tokens na página.
- Tabelas legíveis e compactas; sem botões soltos, HTML bruto ou abas duplicadas.
- Se o KML não traz dados suficientes, exibir uma mensagem específica, **não** fingir que o gráfico foi carregado.

## Gráficos: privacidade e reconstrução

O gerador legado usa URLs da API de gráficos `grafico-api.onrender.com` (provedor externo). **Não chamar esse serviço** a partir do HTML institucional até receber autorização explícita de TI. Uma URL pode codificar assistência, séries, nomes e outros dados de interesse interno.

Prioridade:
1. Reconstituir gráficos localmente com informações **já incluídas** no KML/KMZ;
2. Caso faltem séries temporais, acrescentar **bloco de dados estruturados (`ExtendedData` ou JSON seguro como texto)** no KML gerado pelo VBA, sem quebrar compatibilidade com Google Earth;
3. Renderizar gráficos locais em SVG/Canvas, sem CDN nem API externa;
4. Manter controles como Anual/Mensal e P50/P70 apenas quando os dados de origem os sustentarem.

Não executar scripts da descrição KML com `eval`, `innerHTML` indiscriminado ou iframes.

## Fotos e SharePoint

- Somente URLs com domínio corporativo explicitamente aprovado podem carregar imagens.
- Galeria **sob clique**: o usuário escolhe **Carregar fotos**; tentativas de imagem acontecem a partir do navegador sob login vigente no SharePoint.
- Exibir fallback **Abrir pasta / imagem no SharePoint** para login, imagens indisponíveis e políticas de CORS/CSP.
- URLs de fotos de dentro de KMZ só podem ser resolvidas via blobs locais, com proteção contra ZIP bomb.
- Não enviar KML/KMZ ao GitHub ou a qualquer serviço externo. Testes usam dados inteiramente fictícios.

## Critérios de aceite antes de substituir Google Earth

1. SRs.kml e SRs.kmz: todos os pontos e agrupamentos na posição correta, hierarquia íntegra, ícones e legendas com semântica validada no VBA.
2. Vendas.kml e Vendas.kmz: status, preço, área e fotos vinculados corretamente.
3. Popup SRs sem HTML quebrado, com navegação por teclado e seis abas coerentes.
4. Gráficos anuais, mensais e projeções **reproduzidos localmente**, comparação com a versão atual, sem acessar Render.
5. Fotos via SharePoint disponíveis sob clique e com fallback funcional.
6. HTML único via `file://` no Edge corporativo; o usuário não instala aplicativos.
7. Exemplo sintético e testes automatizados completos; nenhum dado interno no repositório público.
8. Testar desempenho para ~10 mil pontos e KML >80 MB/KMZ equivalente.

## Insumos seguros para finalizar o mapeamento

- Código-fonte sem dados institucionais das funções VBA que **definem estilos e ícones** para SRs e Vendas;
- Um trecho **fictício/redigido** de `<Placemark>`/ `<Style>` que preserve a estrutura de `<description>` de cada perfil (não compartilhar nomes, assistências, contatos, fotos ou URLs reais);
- Um exemplo **fictício** da estrutura do gráfico atual e sua série de dados, para reproduzir localmente.

Não colocar um KML real em issues, commits, testes públicos ou anexos deste repositório.
