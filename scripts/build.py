#!/usr/bin/env python3
"""Gera um HTML autocontido. Necessário apenas para o desenvolvedor."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
page = (ROOT / "src" / "index.html").read_text(encoding="utf-8")

styles = [
    ("../vendor/leaflet.css", ROOT / "vendor" / "leaflet.css"),
    ("../vendor/MarkerCluster.css", ROOT / "vendor" / "MarkerCluster.css"),
    ("./app.css", ROOT / "src" / "app.css"),
]
scripts = [
    ("../vendor/leaflet.min.js", ROOT / "vendor" / "leaflet.min.js"),
    ("../vendor/leaflet.markercluster.js", ROOT / "vendor" / "leaflet.markercluster.js"),
    ("./brazil-states.js", ROOT / "src" / "brazil-states.js"),
    ("./app.js", ROOT / "src" / "app.js"),
]
for href, filename in styles:
    tag = '<link rel="stylesheet" href="' + href + '">'
    assert tag in page, f"Tag CSS não encontrada: {href}"
    page = page.replace(tag, "<style>\n" + filename.read_text(encoding="utf-8") + "\n</style>", 1)
for src, filename in scripts:
    tag = '<script src="' + src + '"></script>'
    assert tag in page, f"Tag JS não encontrada: {src}"
    content = filename.read_text(encoding="utf-8").replace("</script", "<\\/script")
    page = page.replace(tag, "<script>\n" + content + "\n</script>", 1)

# O HTML gerado exige CSP explícita, sem CDNs ou JavaScript remoto.
assert '<script src=' not in page and '<link rel="stylesheet"' not in page
assert "https://tile.openstreetmap.org" in page
output = ROOT / "dist" / "Visualizador_KML.html"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(page, encoding="utf-8")
print(f"Gerado: {output} ({len(page.encode('utf-8')):,} bytes)")
