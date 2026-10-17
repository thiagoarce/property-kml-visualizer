# Análise territorial — filtros locais do visualizador

Esta versão continua abrindo **um único HTML com dois cliques** no Edge. O KML/KMZ não sai do navegador; apenas a cartografia do OpenFreeMap (se ativada) solicita recursos pela rede.

## Como usar

1. Abra `SRs.kml`, `SRs.kmz`, `SRs - Vendas.kml` ou `SRs - Vendas.kmz` no visualizador.
2. Abra **Análise territorial** na barra lateral.
3. Combine **Estado (UF)**, **Macro**, **REC**, **Tipo de imóvel**, **Congregações** (SRs) e **Situação**.
4. Se preferir, digite uma frase com critérios reconhecidos, por exemplo `Quais salões com mais de 5 congregações em SP?` e clique em **Pesquisar no mapa**. Essa interpretação é um conjunto limitado de regras locais; não envia dados a um modelo de IA.
5. Consulte a contagem, a lista de imóveis e o mapa filtrado. Use **Agrupar por** para contar por UF, Macro, REC, tipo, categoria de congregações ou situação.
6. O botão **Exportar resultados (.csv)** cria o arquivo no navegador. Não o envia a nenhum serviço; a proteção desse arquivo depois do download cabe ao usuário e às políticas locais.

## Dados e precisão

- **UF:** usa primeiro um campo UF/Estado explícito em `ExtendedData`. Se não existir, consulta a geometria simplificada dos 27 estados incorporada ao HTML. Pontos junto a fronteiras, ilhas e costa podem ficar sem UF ou precisar de confirmação.
- **Macro e REC:** provenientes das pastas do KML (`Macro 1 (2415)`, `REC Araraquara, SP (91)`) ou campos `ExtendedData` equivalentes. Propriedades sem esses campos aparecem como não identificadas.
- **Tipo / situação:** usa o mapeamento atual de pastas, descrições e estilos do KML. Precisam de validação final com as funções do gerador VBA.
- **Congregações:** um total numérico só é considerado **exato** quando há um campo explícito no KML. Caso contrário, a categoria de cor do ícone pode apenas distinguir `1`, `2`, `3`, `4` e `5 ou mais` (além de `única na cidade`).
- **Distinção essencial:** a pergunta `mais de 5` significa **6 ou mais**. Um ícone preto informa apenas **5 ou mais**. O visualizador inclui esses imóveis como **candidatos** e avisa que não consegue garantir 6+ sem o dado exato.
- O visualizador não consulta a internet para descobrir quantidade de congregações, macro, REC ou estado. Tampouco tenta adivinhar a diferença entre 5 e 6 pela cor.

## Próximas melhorias

- Introduzir campo estruturado `Congregacoes_Quantidade` no `ExtendedData` emitido pelo VBA. Assim a pesquisa por 6+ ficará precisa e rápida para todos os BRAs.
- Considerar exportação de todos os filtros ativos e ordenação avançada da lista de resultados.
- Testar especificamente BRAs em fronteiras de estados e possíveis coordenadas inválidas.

Testes automáticos: `tests/territorial-filters-browser.mjs`, com locais sintéticos de SP e PB, combinações de filtros, 6+ vs 5+, agrupamento, CSV e ausência de chamadas externas.
