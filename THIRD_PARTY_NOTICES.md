# Dependências de terceiros

O arquivo de distribuição inclui trechos das seguintes bibliotecas de código aberto.

- **Leaflet 1.9.4** — https://github.com/Leaflet/Leaflet — BSD 2-Clause License, © Volodymyr Agafonkin e colaboradores. Fonte distribuída: `vendor/leaflet.min.js`, `vendor/leaflet.css`.
- **Leaflet.markercluster 1.5.3** — https://github.com/Leaflet/Leaflet.markercluster — MIT License, © Dave Leaver e colaboradores. Fonte distribuída: `vendor/leaflet.markercluster.js`, `vendor/MarkerCluster.css`.

Consulte os textos completos em `vendor/LICENSE.leaflet.txt` (BSD 2-Clause) e `vendor/LICENSE.leaflet.markercluster.txt` (MIT).

Os tiles do **OpenStreetMap** são solicitados ao servidor oficial, quando ativados. © OpenStreetMap contributors. Políticas de uso: https://operations.osmfoundation.org/policies/tiles/

- **Estados do Brasil (27 UFs, GeoJSON)** — https://github.com/henriquemalvar/br-geojson — Dados geográficos IBGE, CC0 1.0 Universal. Geometrias públicas incorporadas em `src/brazil-states.js` para uso inteiramente local.

## Dependências adicionais do experimento OpenFreeMap

O HTML experimental gerado por `scripts/build_openfreemap.py` também incorpora bibliotecas estáticas baixadas **somente durante a compilação** (nenhuma dependência de CDN para o usuário final):

- **MapLibre GL JS 5.12.0** — https://github.com/maplibre/maplibre-gl-js — BSD-3-Clause.
- **@maplibre/maplibre-gl-leaflet 0.1.4** — https://github.com/maplibre/maplibre-gl-leaflet — ISC.
- **JSZip 3.10.1** — https://github.com/Stuk/jszip — MIT. Usado para extrair o KML de um KMZ diretamente no navegador.

OpenFreeMap fornece cartografia online sob demanda. Licenças das bibliotecas e atribuições dos dados cartográficos devem ser mantidas.
