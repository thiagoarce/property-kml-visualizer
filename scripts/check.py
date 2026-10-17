#!/usr/bin/env python3
"""Verificações estáticas sem instalações de dependências."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
viewer = (root / "dist/Visualizador_KML.html").read_text(encoding="utf-8")
app = (root / "src/app.js").read_text(encoding="utf-8")
kml = ET.parse(root / "exemplos/exemplo-ficticio.kml")
ns = {"k": "http://www.opengis.net/kml/2.2"}
points = kml.findall(".//k:Point", ns)

assert len(points) == 4, f"Exemplo sintético deve ter 4 pontos, encontrou {len(points)}"
assert not re.search(r"<script\s+src=", viewer, re.IGNORECASE)
assert not re.search(r"<link\s+rel=['\"]stylesheet", viewer, re.IGNORECASE)
assert all(part in viewer for part in ["leaflet", "markercluster", "tile.openstreetmap.org"])
assert not re.search(r"\b(fetch|XMLHttpRequest|sendBeacon)\s*\(", app)
assert "DOMParser().parseFromString(source, 'application/xml')" in app
assert "BRAZIL_STATES_GEOJSON" in viewer
assert 'id="osmToggle"' in viewer and 'id="osmToggle" checked' not in viewer
assert "state.osm = false" in app
assert "tileerror" in app
assert "BLOCKED_TAGS" in app and "validLink" in app
assert "default-src 'none'" in viewer
assert "connect-src 'none'" in viewer
assert 'id="welcomeScreen"' in viewer and 'id="loadingScreen"' in viewer
assert 'id="workspaceLocais"' in viewer and 'id="workspaceLegend"' in viewer
assert 'Dados do KML processados no navegador' not in viewer
assert 'Reabrir exemplo' not in viewer
print("OK: arquivo único, segurança básica, exemplo sintético e ausência de envio de KML")
