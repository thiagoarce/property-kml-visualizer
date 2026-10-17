#!/usr/bin/env python3
"""Compila uma versão SINGLE-HTML do visualizador com OpenFreeMap.
Rode SOMENTE no computador do desenvolvedor (Python + internet).
Usuários finais abrem dist/Visualizador_KML_OpenFreeMap.html por duplo clique.
Nenhum KML institucional é acessado, lido ou transferido durante o build.
"""
from pathlib import Path
from urllib.request import Request, urlopen
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUTPUT = DIST / "Visualizador_KML_OpenFreeMap.html"

# Não usar MapLibre v6 aqui sem retestar os Workers em file://.
DEPENDENCIES = {
    "css": (
        "https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css",
        "https://cdn.jsdelivr.net/npm/maplibre-gl@5.12.0/dist/maplibre-gl.css",
    ),
    "maplibre": (
        "https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js",
        "https://cdn.jsdelivr.net/npm/maplibre-gl@5.12.0/dist/maplibre-gl.js",
    ),
    "adapter": (
        "https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/dist/leaflet-maplibre-gl.js",
        "https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/dist/leaflet-maplibre-gl.js",
    ),
    "jszip": (
        "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js",
        "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    ),
}

def get_asset(kind: str) -> str:
    last_error = None
    for url in DEPENDENCIES[kind]:
        try:
            print(f"Baixando biblioteca para empacotamento: {url}", flush=True)
            req = Request(url, headers={"User-Agent": "PropertyKMLVisualizer-Build/1.0"})
            with urlopen(req, timeout=40) as response:
                data = response.read()
            if len(data) < (50000 if kind == "maplibre" else 1000):
                raise ValueError(f"Arquivo inesperadamente pequeno: {len(data)} bytes")
            return data.decode("utf-8-sig")
        except Exception as error:
            last_error = error
            print(f"  Falhou nesse CDN: {error}", file=sys.stderr)
    raise RuntimeError(f"Não foi possível obter {kind}. Verifique a conexão: {last_error}")

def must_replace(source: str, old: str, new: str, count=1) -> str:
    actual = source.count(old)
    if actual != count:
        raise RuntimeError(f"Não foi encontrado exatamente {count}x o trecho esperado: {old[:130]!r} (achado {actual}x). "
                           "Confira se a branch original mudou.")
    return source.replace(old, new, count)

def safe_script(source: str) -> str:
    return source.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")

def main():
    # Reusa o build vigente; NÃO substitui o dist original nem modifica src/.
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build.py")], check=True)
    page = (DIST / "Visualizador_KML.html").read_text(encoding="utf-8")

    css = get_asset("css")
    maplibre = get_asset("maplibre")
    adapter = get_asset("adapter")
    jszip = get_asset("jszip")

    # Nenhum CDN é requisitado ao abrir o arquivo gerado.
    page = must_replace(
        page, "</head>",
        "<style>\n/* MapLibre GL JS 5.12.0 (BSD-3-Clause) */\n" + css + "\n</style>\n</head>"
    )

    anchor = "<script>\n/* Property KML Visualizer"
    injection = (
        "<script>\n/* MapLibre GL JS 5.12.0 */\n" + safe_script(maplibre) + "\n</script>\n"
        "<script>\n/* @maplibre/maplibre-gl-leaflet 0.1.4 */\n" + safe_script(adapter) + "\n</script>\n"
        "<script>\n/* JSZip 3.10.1 for KMZ input (MIT) */\n" + safe_script(jszip) + "\n</script>\n"
    )
    page = must_replace(page, anchor, injection + anchor)

    original_layer_start = "  // OSM é OPCIONAL e fica desligado por padrão."
    original_layer_end = "  const markers = L.markerClusterGroup("
    start = page.find(original_layer_start)
    end = page.find(original_layer_end, start)
    if start < 0 or end <= start:
        raise RuntimeError("Não foi possível localizar a camada OSM original em src/app.js.")

    replacement = """  // OpenFreeMap fornece tiles vetoriais e exige MapLibre GL, não L.tileLayer.
  // Inativo por padrão: só consulta cartografia após clique explícito.
  const raster = L.maplibreGL({
    style: 'https://tiles.openfreemap.org/styles/liberty'
  });
  let errorAlreadyShown = false;
  raster.on('add', () => {
    const glmap = raster.getMaplibreMap && raster.getMaplibreMap();
    if (!glmap || glmap._ofmErrorListener) return;
    glmap._ofmErrorListener = true;
    glmap.on('error', event => {
      if (!state.osm) return;
      console.warn('OpenFreeMap/MapLibre:', event.error || event);
      if (!errorAlreadyShown) {
        errorAlreadyShown = true;
        showToast('Erro ao obter mapa OpenFreeMap. Confira Console/Rede: CORS, worker ou acesso bloqueado.');
      }
    });
  });
  map.attributionControl.addAttribution('OpenFreeMap © OpenMapTiles · © OpenStreetMap contributors');
"""
    page = page[:start] + replacement + page[end:]

    page = must_replace(
        page,
        "https://tile.openstreetmap.org; connect-src 'none'; font-src 'none';",
        "https://tiles.openfreemap.org https://assets.openfreemap.com; "
        "connect-src https://tiles.openfreemap.org https://assets.openfreemap.com; "
        "worker-src blob:; child-src blob:; font-src 'none';"
    )
    page = must_replace(page, "Ruas online (teste)", "OpenFreeMap (teste)")
    page = must_replace(page, "'Ruas online · experimental'", "'OpenFreeMap · ruas vetoriais'")
    page = must_replace(
        page,
        "'O OpenStreetMap pode bloquear arquivos abertos por duplo clique. Nenhum dado do KML é enviado.'",
        "'Carregando ruas vetoriais do OpenFreeMap. Dados do KML permanecem locais.'"
    )

    if re.search(r'<(?:script|link)\b[^>]+(?:src|href)\s*=\s*["\']https?://', page, re.I):
        raise RuntimeError("O HTML final contém referência a JS/CSS remoto: abortando.")
    if "https://tile.openstreetmap.org/" in page:
        raise RuntimeError("A URL de tiles raster do OSM ainda aparece no arquivo final.")
    assert "L.maplibreGL" in page
    assert "JSZip" in page and "extractKmzKml" in page
    assert "tiles.openfreemap.org/styles/liberty" in page
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"\nGERADO: {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
    print("ABRA COM DOIS CLIQUES (file://) e marque 'OpenFreeMap (teste)'.")
    print("O usuário final NÃO precisa de Python, Node ou conexão para abrir a interface.")
    print("Somente a cartografia vetorial exige internet. O KML fica no navegador.")

if __name__ == "__main__":
    main()
