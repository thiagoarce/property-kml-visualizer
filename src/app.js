/* Property KML Visualizer — código público; nenhum dado institucional deve ser versionado. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { features: [], shapes: [], filtered: [], fileName: '', selected: null, group: '', search: '', osm: false, iconFilter: '', iconUrls: [] };
  const ALLOWED_TAGS = new Set('a b blockquote br button caption code dd div dl dt em h1 h2 h3 h4 h5 h6 hr i li ol p pre small span strong sub sup table tbody td th thead tr u ul'.split(' '));
  const BLOCKED_TAGS = new Set('script style iframe svg object embed form input select textarea link meta video audio canvas picture source'.split(' '));
  // Teto preventivo, nao uma limitacao do KML ou do OpenFreeMap.
  // KMLs de SRs podem passar de 80 MB; acima de centenas de MB o DOMParser pode consumir muita RAM.
  const MAX_KML_MB = 512;
  const MAX_KMZ_MB = 512;
  const LARGE_KML_MB = 80;
  let filterTimer = null;
  const map = L.map('map', { zoomControl: false, preferCanvas: true, minZoom: 2, maxZoom: 19, worldCopyJump: true }).setView([-14.5, -52], 4);
  // Cartografia local SEM solicitações de rede: geometria pública dos 27 estados.
  // A camada vetorial fica abaixo dos tiles, quando estes forem ativados.
  map.createPane('vectorMap');
  map.getPane('vectorMap').style.zIndex = '180';
  map.getPane('vectorMap').style.pointerEvents = 'none';
  const vectorBase = L.geoJSON(BRAZIL_STATES_GEOJSON, {
    pane: 'vectorMap',
    interactive: false,
    style: feature => ({
      color: '#b3c9ce', weight: 1, opacity: 1,
      fillColor: '#dce9e1', fillOpacity: 1
    })
  }).addTo(map);
  const stateLabels = L.layerGroup();
  for (const feature of BRAZIL_STATES_GEOJSON.features) {
    const stateName = feature.properties?.sigla || '';
    const center = L.geoJSON(feature).getBounds().getCenter();
    L.marker(center, {
      interactive: false, keyboard: false,
      icon: L.divIcon({
        className: 'state-label',
        html: '<span>' + stateName + '</span>',
        iconSize: [34, 16], iconAnchor: [17, 8]
      })
    }).addTo(stateLabels);
  }
  function updateStateLabels() {
    if (!state.osm && map.getZoom() <= 6) {
      if (!map.hasLayer(stateLabels)) stateLabels.addTo(map);
    } else if (map.hasLayer(stateLabels)) map.removeLayer(stateLabels);
  }
  map.on('zoomend', updateStateLabels);
  updateStateLabels();
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Limites estaduais: IBGE · CC0');
  L.control.scale({ imperial: false }).addTo(map);
  // OSM é OPCIONAL e fica desligado por padrão. O provedor pode bloquear file://.
  const raster = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors', updateWhenIdle: true, keepBuffer: 2
  });
  raster.on('tileerror', () => {
    if (!state.osm) return;
    state.osm = false;
    $('osmToggle').checked = false;
    if (map.hasLayer(raster)) map.removeLayer(raster);
    updateStateLabels();
    $('statusTitle').textContent = 'Brasil · mapa vetorial local';
    showToast('Ruas online indisponíveis. O mapa vetorial offline permanece ativo.');
  });
  const markers = L.markerClusterGroup({
    chunkedLoading: true, chunkInterval: 120, chunkDelay: 30,
    removeOutsideVisibleBounds: true, showCoverageOnHover: false,
    maxClusterRadius: 52,
    iconCreateFunction: cluster => {
      const count = cluster.getChildCount();
      return L.divIcon({ className: 'map-cluster', html: '<span>' + count.toLocaleString('pt-BR') + '</span>', iconSize: [40, 40], iconAnchor: [20, 20] });
    }
  });
  const shapes = L.layerGroup().addTo(map);
  map.addLayer(markers);
  function text(n) { return n ? (n.textContent || '').trim() : ''; }
  function kids(n, local) { return [...(n ? n.children : [])].filter(x => x.localName === local); }
  function child(n, local) { return kids(n, local)[0] || null; }
  function directText(n, local) { return text(child(n, local)); }
  function safeNumber(n) { return Number.isFinite(n) ? n : null; }
  function parseCoordinates(value) {
    // KML admite espaços após vírgulas: "-60.0217, -3.1190".
    // Antes, split por whitespace criava "-60.0217," + "-3.1190";
    // Number('') virava 0 e colocava milhares de pontos sobre o Equador.
    // Também suporta LineString com vários pares e altitude opcional.
    return (value || '').trim().replace(/\s*,\s*/g, ',').split(/\s+/).map(pair => {
      const parts = pair.split(',');
      if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) return null;
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      return Number.isFinite(lon) && Number.isFinite(lat) &&
        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? [lat, lon] : null;
    }).filter(Boolean);
  }
  function xmlColor(kmlColor) {
    const c = String(kmlColor || '').replace('#', '').trim();
    if (/^[a-fA-F0-9]{8}$/.test(c)) return '#' + c.slice(6, 8) + c.slice(4, 6) + c.slice(2, 4);
    return null;
  }
  function styleColor(node, styles, styleMaps, depth = 0) {
    if (depth > 3) return null;
    const inline = child(node, 'Style') || node;
    const iconStyle = child(inline, 'IconStyle') || child(inline, 'LineStyle') || child(inline, 'PolyStyle');
    const candidate = iconStyle ? xmlColor(directText(iconStyle, 'color')) : null;
    if (candidate) return candidate;
    const ref = directText(node, 'styleUrl').replace(/^#/, '');
    if (!ref) return null;
    if (styles.has(ref)) return styleColor(styles.get(ref), styles, styleMaps, depth + 1);
    if (styleMaps.has(ref)) {
      const elem = styleMaps.get(ref);
      const pairs = kids(elem, 'Pair');
      const normal = pairs.find(x => directText(x, 'key') === 'normal') || pairs[0];
      return normal ? styleColor(normal, styles, styleMaps, depth + 1) : null;
    }
    return null;
  }
  const ICON_SHAPES = new Set(['circle', 'square', 'diamond', 'triangle', 'star', 'pushpin']);
  function iconShapeFromHref(href) {
    const name = String(href || '').toLowerCase().split(/[/?#]/).pop() || '';
    if (/star/.test(name)) return 'star';
    if (/diamond/.test(name)) return 'diamond';
    if (/triangle/.test(name)) return 'triangle';
    if (/square|rect/.test(name)) return 'square';
    if (/pushpin|paddle|pin/.test(name)) return 'pushpin';
    return 'circle';
  }
  function colorFromHref(href) {
    const basename = String(href || '').toLowerCase().split(/[/?#]/).pop() || '';
    const name = basename.replace(/^(?:icon|marker)[-_]?/, '');
    const colors = [
      [/^(?:red|vermelho|r)[-_.]/, '#d44545'],
      [/^(?:grn|green|verde)[-_.]/, '#269965'],
      [/^(?:ylw|yellow|amarelo)[-_.]/, '#d7aa16'],
      [/^(?:orange|org|laranja)[-_.]/, '#df8730'],
      [/^(?:blue|blu|azul)[-_.]/, '#2984bd'],
      [/^(?:purple|pur|roxo)[-_.]/, '#894db4'],
      [/^(?:pink|pnk|rosa)[-_.]/, '#c55d8c'],
      [/^(?:wht|white|branco)[-_.]/, '#e4e8e7']
    ];
    return colors.find(x => x[0].test(name))?.[1] || null;
  }
  function colorName(color) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(color || ''));
    if (!match) return 'Sem cor definida';
    const rgb = [1, 3, 5].map(i => parseInt(match[1].slice(i - 1, i + 1), 16));
    const [r, g, b] = rgb;
    const max = Math.max(...rgb), min = Math.min(...rgb);
    if (max - min < 25) return 'Cinza';
    if (r > g * 1.23 && r > b * 1.2) return 'Vermelho';
    if (r > 110 && g > 80 && r > b * 1.4 && g > b * 1.3) return g > r * .8 ? 'Amarelo' : 'Laranja';
    if (g > r * 1.24 && g > b * 1.04) return 'Verde';
    if (b > r * 1.23 && b > g * 1.1) return 'Azul';
    if (r > g * 1.18 && b > g * 1.18) return 'Roxo';
    if (b >= r && b >= g * .85 && g > r * 1.1) return 'Azul';
    return 'Cor do KML';
  }
  function styleIconInfo(node, styles, styleMaps, depth = 0) {
    if (depth > 5 || !node) return null;
    const inline = child(node, 'Style') || (node.localName === 'Style' ? node : null);
    const iconStyle = inline ? child(inline, 'IconStyle') : null;
    if (iconStyle) {
      const href = directText(child(iconStyle, 'Icon'), 'href');
      const color = xmlColor(directText(iconStyle, 'color')) || colorFromHref(href) || null;
      const scaleRaw = Number(directText(iconStyle, 'scale'));
      const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(2.1, Math.max(.6, scaleRaw)) : 1;
      return { href, color, scale, kind: iconShapeFromHref(href) };
    }
    const ref = directText(node, 'styleUrl').replace(/^.*#/, '');
    if (ref && styles.has(ref)) return styleIconInfo(styles.get(ref), styles, styleMaps, depth + 1);
    if (ref && styleMaps.has(ref)) {
      const pair = kids(styleMaps.get(ref), 'Pair');
      const normal = pair.find(p => directText(p, 'key') === 'normal') || pair[0];
      return normal ? styleIconInfo(normal, styles, styleMaps, depth + 1) : null;
    }
    return null;
  }
  function iconKey(feature) {
    return [feature.color || '#1682a2', feature.iconKind || 'circle', feature.iconHref || ''].join('|');
  }
  function parseKml(source, fileName) {
    const xml = new DOMParser().parseFromString(source, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('KML com XML inválido. Confira se o arquivo foi gerado corretamente.');
    const root = xml.documentElement;
    if (!root || root.localName !== 'kml') throw new Error('O arquivo não parece ser um KML válido.');
    const styles = new Map(), styleMaps = new Map();
    for (const n of xml.getElementsByTagName('*')) {
      if (n.localName === 'Style' && n.hasAttribute('id')) styles.set(n.getAttribute('id'), n);
      if (n.localName === 'StyleMap' && n.hasAttribute('id')) styleMaps.set(n.getAttribute('id'), n);
    }
    const features = [], extraShapes = [], folders = new Set();
    function parsePlacemark(n, path) {
      const name = directText(n, 'name') || 'Local sem nome';
      const description = directText(n, 'description');
      const iconInfo = styleIconInfo(n, styles, styleMaps) || {};
      const color = styleColor(n, styles, styleMaps) || iconInfo.color || '#1682a2';
      const href = iconInfo.href || '';
      const styleName = directText(n, 'styleUrl').replace(/^.*#/, '');
      const iconKind = iconInfo.kind || 'circle';
      const metadata = {};
      for (const d of n.getElementsByTagName('*')) {
        if (d.localName === 'Data' && d.getAttribute('name')) metadata[d.getAttribute('name')] = directText(d, 'value');
      }
      const points = [...n.getElementsByTagName('*')].filter(x => x.localName === 'Point');
      const common = { name, path, color, description, metadata, iconHref: href, iconKind, iconScale: iconInfo.scale || 1, styleName };
      for (const point of points) {
        const coords = parseCoordinates(directText(point, 'coordinates'));
        if (coords.length) features.push({ ...common, pos: coords[0], id: features.length });
      }
      for (const line of n.getElementsByTagName('*')) {
        if (line.localName !== 'LineString' && line.localName !== 'LinearRing') continue;
        const coords = parseCoordinates(directText(line, 'coordinates'));
        if (coords.length >= 2) extraShapes.push({ type: line.localName, coords, ...common });
      }
    }
    function walk(n, path) {
      for (const c of n.children) {
        if (c.localName === 'Folder') {
          const next = [...path, directText(c, 'name') || 'Pasta sem nome'];
          folders.add(next.join(' / '));
          walk(c, next);
        } else if (c.localName === 'Document') {
          walk(c, path);
        } else if (c.localName === 'Placemark') {
          parsePlacemark(c, path);
        }
      }
    }
    walk(root, []);
    return { features, shapes: extraShapes, folders: [...folders], fileName };
  }
  function validLink(raw) {
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' || u.protocol === 'hub:';
    } catch (_) { return false; }
  }
  function copySafe(dst, node) {
    if (node.nodeType === Node.TEXT_NODE) { dst.appendChild(document.createTextNode(node.nodeValue || '')); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'img') {
      const src = node.getAttribute('src') || '';
      if (validLink(src) && /^https:\/\/[a-z0-9.-]*jwsite\.sharepoint\.com(\/|$)/i.test(src)) {
        const a = document.createElement('a');
        a.href = src; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = '[Abrir imagem no SharePoint]';
        dst.appendChild(a);
      }
      return;
    }
    if (BLOCKED_TAGS.has(tag)) return;
    const isAllowed = ALLOWED_TAGS.has(tag);
    const out = isAllowed ? document.createElement(tag) : dst;
    if (isAllowed) {
      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        if (validLink(href)) { out.href = href; out.target = '_blank'; out.rel = 'noopener noreferrer'; }
      }
      const classList = (node.getAttribute('class') || '').split(/\s+/).filter(x => /^[a-zA-Z_][\w-]{0,50}$/.test(x));
      if (classList.length) out.className = classList.slice(0, 8).join(' ');
      const id = node.getAttribute('id');
      if (id && /^[a-zA-Z_][\w-]{0,60}$/.test(id)) out.dataset.kmlId = id;
      if (tag === 'button') {
        out.type = 'button';
        const onclick = node.getAttribute('onclick') || '';
        const found = onclick.match(/(?:openTab|mostrarAba|showTab)\([^,]*,\s*['"]([^'"]+)['"]/i);
        if (found) out.dataset.kmlTarget = found[1];
      }
      dst.appendChild(out);
    }
    for (const c of node.childNodes) copySafe(out, c);
  }
  function safeDescription(raw) {
    const container = document.createElement('div');
    container.className = 'description';
    const doc = new DOMParser().parseFromString(raw || '', 'text/html');
    for (const c of [...doc.body.childNodes]) copySafe(container, c);
    return container;
  }
  function activateTabs(box) {
    const buttons = [...box.querySelectorAll('.tabs button')];
    const panels = [...box.querySelectorAll('.tabcontent, .tab-pane, .tab-panel')];
    if (!buttons.length || !panels.length) return;
    buttons.forEach((b, i) => {
      b.classList.add('tab-selector');
      b.addEventListener('click', () => {
        const target = b.dataset.kmlTarget;
        let index = target ? panels.findIndex(p => p.dataset.kmlId === target) : -1;
        if (index < 0) index = i;
        buttons.forEach(x => x.classList.toggle('active', x === b));
        panels.forEach((p, j) => { p.style.display = j === index ? 'block' : 'none'; });
      });
    });
    buttons[0].click();
  }
  function markerSymbol(kind, color, imageUrl) {
    const span = document.createElement('span');
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl; img.alt = ''; img.className = 'kml-icon-img';
      span.className = 'symbol symbol-image';
      span.appendChild(img);
    } else {
      span.className = 'symbol symbol-' + (ICON_SHAPES.has(kind) ? kind : 'circle');
      span.style.setProperty('--pin-color', /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#1682a2');
    }
    return span;
  }
  function makePin(feature) {
    const scale = Math.min(2.1, Math.max(.6, feature.iconScale || 1));
    const size = Math.round(22 * scale);
    const wrapper = document.createElement('div');
    wrapper.appendChild(markerSymbol(feature.iconKind || 'circle', feature.color, feature.iconUrl));
    return L.divIcon({
      className: 'map-pin',
      html: wrapper.innerHTML,
      iconSize: [size, size],
      iconAnchor: [Math.round(size / 2), Math.round(size / 2)]
    });
  }

  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { el.hidden = true; }, 6300);
  }
  function resetDetail() { $('detail').hidden = true; $('detailBody').replaceChildren(); state.selected = null; }
  function showDetail(feature) {
    state.selected = feature;
    $('detailTitle').textContent = feature.name;
    $('detailSubtitle').textContent = feature.path.join(' / ') || 'Sem pasta';
    const body = $('detailBody');
    body.replaceChildren();
    const meta = document.createElement('div');
    meta.className = 'metadata';
    meta.textContent = 'Latitude ' + feature.pos[0].toFixed(5) + ' · Longitude ' + feature.pos[1].toFixed(5);
    body.appendChild(meta);
    body.appendChild(safeDescription(feature.description));
    const md = Object.entries(feature.metadata);
    if (md.length && !feature.description.trim()) {
      const table = document.createElement('table');
      for (const [k, v] of md) {
        const tr = table.insertRow(); tr.insertCell().textContent = k; tr.insertCell().textContent = v;
      }
      body.appendChild(table);
    }
    activateTabs(body);
    $('detail').hidden = false;
  }
  function renderGroups() {
    const select = $('groups');
    select.replaceChildren();
    const all = document.createElement('option'); all.value = ''; all.textContent = 'Todas as pastas'; select.appendChild(all);
    const groups = [...new Set(state.features.map(f => f.path.join(' / ')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    for (const group of groups) {
      const option = document.createElement('option');
      option.value = group; option.textContent = group; select.appendChild(option);
    }
    $('groupCount').textContent = String(groups.length);
  }
  function renderList() {
    const list = $('results'); list.replaceChildren();
    const limit = 160;
    for (const mark of state.filtered.slice(0, limit)) {
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'result';
      const dot = document.createElement('i'); dot.className = 'result-dot';
      dot.appendChild(markerSymbol(mark.iconKind || 'circle', mark.color, mark.iconUrl));
      const info = document.createElement('span'); info.className = 'result-info';
      const strong = document.createElement('strong'); strong.textContent = mark.name;
      const sub = document.createElement('small'); sub.textContent = mark.path.join(' / ') || 'Sem pasta';
      info.append(strong, sub);
      item.append(dot, info);
      item.addEventListener('click', () => selectFeature(mark));
      list.append(item);
    }
    if (state.filtered.length > limit) {
      const foot = document.createElement('p'); foot.className = 'truncated';
      foot.textContent = 'Exibindo os primeiros ' + limit + ' locais. Use a busca para refinar.';
      list.appendChild(foot);
    }
  }
  function selectFeature(feature) {
    map.setView(feature.pos, Math.max(map.getZoom(), 13), { animate: true });
    showDetail(feature);
    if (feature.marker) {
      markers.zoomToShowLayer(feature.marker, () => feature.marker.openTooltip());
    }
  }
  function renderMap(fit = false) {
    markers.clearLayers(); shapes.clearLayers();
    const batch = [];
    for (const f of state.filtered) {
      const marker = L.marker(f.pos, { icon: makePin(f), keyboard: true, title: f.name });
      marker.bindTooltip(f.name, { direction: 'top', offset: [0, -9] });
      marker.on('click', () => showDetail(f));
      f.marker = marker;
      batch.push(marker);
    }
    markers.addLayers(batch);
    for (const s of state.shapes) {
      const groupPath = s.path.join(' / ');
      if (state.group && groupPath !== state.group) continue;
      const term = state.search;
      if (term && !(s.name + ' ' + groupPath).toLocaleLowerCase('pt-BR').includes(term)) continue;
      if (s.type === 'LineString' || s.type === 'LinearRing') {
        L.polyline(s.coords, { color: s.color, weight: 3, opacity: .8 }).addTo(shapes).bindTooltip(s.name);
      }
    }
    if (fit && state.filtered.length) {
      const bounds = L.latLngBounds(state.filtered.map(f => f.pos));
      map.fitBounds(bounds.pad(.1), { maxZoom: 12, animate: false });
    }
  }
  function updateFilters(fit = false) {
    state.group = $('groups').value;
    state.search = $('search').value.trim().toLocaleLowerCase('pt-BR');
    state.filtered = state.features.filter(f => {
      const group = f.path.join(' / ');
      if (state.group && group !== state.group) return false;
      if (!state.search) return true;
      const hay = (f.name + ' ' + group + ' ' + Object.values(f.metadata).join(' ')).toLocaleLowerCase('pt-BR');
      return hay.includes(state.search);
    });
    $('filteredCount').textContent = state.filtered.length.toLocaleString('pt-BR');
    $('foundCount').textContent = state.filtered.length.toLocaleString('pt-BR');
    renderList();
    renderMap(fit);
  }
  function install(parsed) {
    resetDetail();
    state.features = parsed.features;
    state.shapes = parsed.shapes;
    state.fileName = parsed.fileName;
    $('fileName').textContent = parsed.fileName;
    $('totalCount').textContent = parsed.features.length.toLocaleString('pt-BR');
    $('shapeCount').textContent = parsed.shapes.length ? ' · ' + parsed.shapes.length + ' linhas' : '';
    $('search').value = ''; state.search = ''; state.group = '';
    renderGroups(); updateFilters(true);
    if (!state.features.length) showToast('KML válido, mas sem marcadores Point. Alguns elementos podem ser não pontuais.');
  }
  function decodeKmlBytes(bytes) {
    let str;
    try { str = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { str = new TextDecoder('windows-1252').decode(bytes); }
    const declared = (str.slice(0, 250).match(/encoding\s*=\s*["']([^"']+)/i) || [])[1] || '';
    if (/^(iso-8859-1|windows-1252)$/i.test(declared)) str = new TextDecoder('windows-1252').decode(bytes);
    return str;
  }
  async function extractKmzKml(bytes) {
    // A biblioteca ZIP é embutida somente no HTML OpenFreeMap compilado.
    // Não há descompactação em servidor nem leitura automática de imagens/anexos.
    if (typeof JSZip === 'undefined') {
      throw new Error('Esta edição não inclui suporte a KMZ. Abra a versão OpenFreeMap.');
    }
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
    const candidates = Object.values(zip.files)
      .filter(entry => !entry.dir && /\.kml$/i.test(entry.name) &&
        !/(^|\/)__MACOSX\//i.test(entry.name));
    if (!candidates.length) throw new Error('KMZ inválido: nenhum arquivo .kml encontrado no pacote.');
    // Padrão KMZ: doc.kml na raiz. Algumas ferramentas usam outras pastas/nomes.
    candidates.sort((a, b) => {
      function priority(entry) {
        const name = entry.name.replace(/\\/g, '/');
        return (name.toLowerCase() === 'doc.kml' ? 0 : /(^|\/)doc\.kml$/i.test(name) ? 1 : 2) * 10000 +
          name.split('/').length * 100 + name.length;
      }
      return priority(a) - priority(b);
    });
    const target = candidates[0];
    // Evita descompactar inadvertidamente outros recursos do KMZ (imagens etc.).
    // UncompressedSize vem do diretório central ZIP: checagem preventiva, não garantia absoluta.
    const expanded = target._data && target._data.uncompressedSize;
    if (Number.isFinite(expanded) && expanded > MAX_KML_MB * 1024 * 1024) {
      throw new Error('KML interno maior que ' + MAX_KML_MB + ' MB. Leitura incremental ainda não implementada.');
    }
    const result = await target.async('uint8array');
    if (result.byteLength > MAX_KML_MB * 1024 * 1024) {
      throw new Error('KML extraído maior que ' + MAX_KML_MB + ' MB.');
    }
    return { bytes: result, name: target.name, otherFiles: Object.keys(zip.files).length - 1 };
  }
  async function readKml(file) {
    if (!file) return;
    const isKmz = /\.kmz$/i.test(file.name);
    if (!isKmz && !/\.kml$/i.test(file.name)) {
      showToast('Selecione um arquivo .kml ou .kmz.');
      return;
    }
    const maxMB = isKmz ? MAX_KMZ_MB : MAX_KML_MB;
    if (file.size > maxMB * 1024 * 1024) {
      showToast('Arquivo maior que ' + maxMB + ' MB. Ainda não temos leitura em streaming.');
      return;
    }
    const tamanhoMB = (file.size / (1024 * 1024)).toFixed(1);
    $('fileName').textContent = 'Lendo ' + file.name + ' (' + tamanhoMB + ' MB)...';
    if (file.size > LARGE_KML_MB * 1024 * 1024) {
      showToast('Arquivo grande (' + tamanhoMB + ' MB). Aguarde: a leitura pode usar bastante memória.');
    }
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      let data = await file.arrayBuffer();
      let kmzInfo = null;
      if (isKmz) {
        $('fileName').textContent = 'Descompactando KML dentro de ' + file.name + '...';
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        const extracted = await extractKmzKml(data);
        data = extracted.bytes;
        kmzInfo = extracted;
      }
      let str = decodeKmlBytes(data);
      data = null; // Permite descartar o buffer antes de materializar a árvore XML.
      $('fileName').textContent = 'Interpretando ' + file.name + '...';
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const result = parseKml(str, file.name);
      str = null;
      install(result);
      if (kmzInfo) {
        showToast('KMZ aberto: ' + kmzInfo.name + '. Imagens e ícones internos ainda não são exibidos.');
      }
    } catch (err) {
      $('fileName').textContent = state.fileName || 'Nenhum arquivo aberto';
      showToast('Não foi possível abrir: ' + (err && err.message ? err.message : String(err)));
      console.error('Falha na importação local do KML/KMZ:', err);
    }
  }
  const examples = [
    ['BRA9901 — Recife/PE', -8.05, -34.88, 'Macro 4 / REC Recife', '#1682a2'],
    ['BRA9902 — João Pessoa/PB', -7.12, -34.87, 'Macro 4 / REC João Pessoa', '#18a07e'],
    ['BRA9903 — Fortaleza/CE', -3.73, -38.52, 'Macro 4 / REC Fortaleza', '#1682a2'],
    ['BRA9904 — Brasília/DF', -15.79, -47.88, 'Macro 5 / REC Brasília', '#bd8a30'],
    ['BRA9905 — Manaus/AM', -3.10, -60.02, 'Macro 5 / REC Manaus', '#bd8a30'],
    ['BRA9906 — São Paulo/SP', -23.55, -46.63, 'Macro 2 / REC São Paulo', '#1682a2'],
    ['BRA9907 — Porto Alegre/RS', -30.03, -51.23, 'Macro 1 / REC Porto Alegre', '#18a07e'],
    ['BRA9908 — Belém/PA', -1.45, -48.50, 'Macro 5 / REC Belém', '#1682a2']
  ];
  function loadDemo() {
    const f = examples.map((r, i) => ({
      name: r[0], pos: [r[1], r[2]], path: r[3].split(' / '),
      color: r[4], id: i, metadata: { BRA: r[0].split(' ')[0], Cidade: r[0].split('—')[1] },
      description: '<h2>Exemplo inteiramente fictício</h2><p>Este registro é demonstrativo e não contém informações institucionais.</p><div class="tabs"><button onclick="openTab(event,\'local\')">Local</button><button onclick="openTab(event,\'congregacoes\')">Congregações</button></div><div class="tabcontent" id="local"><p><b>Capacidade fictícia:</b> 250 assentos</p></div><div class="tabcontent" id="congregacoes"><table><tr><th>Congregação fictícia</th><th>Assistência fictícia</th></tr><tr><td>Exemplo</td><td>180</td></tr></table></div>'
    }));
    install({ features: f, shapes: [], fileName: 'Exemplo fictício (8 BRAs)' });
  }
  // Somente o pacote OpenFreeMap inclui JSZip; a edição legada permanece KML-only.
  if (typeof JSZip !== 'undefined') {
    $('upload').accept += ',.kmz,application/vnd.google-earth.kmz';
    const dropHint = document.querySelector('#dropzone small');
    if (dropHint) dropHint.textContent = 'ou clique para selecionar .kml ou .kmz';
    const dropTitle = document.querySelector('#dropzone strong');
    if (dropTitle) dropTitle.textContent = 'Arraste seu KML ou KMZ aqui';
  }
  $('upload').addEventListener('change', e => { readKml(e.target.files[0]); e.target.value = ''; });
  $('openButton').addEventListener('click', () => $('upload').click());
  $('demoButton').addEventListener('click', loadDemo);
  $('closeDetail').addEventListener('click', resetDetail);
  $('fitButton').addEventListener('click', () => {
    if (state.filtered.length) map.fitBounds(L.latLngBounds(state.filtered.map(f => f.pos)).pad(.1), { maxZoom: 12 });
  });
  $('osmToggle').addEventListener('change', e => {
    state.osm = e.target.checked;
    if (state.osm) {
      raster.addTo(map);
      $('statusTitle').textContent = 'Ruas online · experimental';
      showToast('O OpenStreetMap pode bloquear arquivos abertos por duplo clique. Nenhum dado do KML é enviado.');
    } else {
      if (map.hasLayer(raster)) map.removeLayer(raster);
      $('statusTitle').textContent = 'Brasil · mapa vetorial local';
      showToast('Mapa vetorial local ativado. Sem requisições cartográficas externas.');
    }
    updateStateLabels();
  });
  $('search').addEventListener('input', () => {
    clearTimeout(filterTimer); filterTimer = setTimeout(() => updateFilters(false), 180);
  });
  $('groups').addEventListener('change', () => updateFilters(true));
  const drop = $('dropzone');
  ['dragenter', 'dragover'].forEach(event => drop.addEventListener(event, e => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(event => drop.addEventListener(event, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', e => { readKml(e.dataTransfer.files[0]); });
  drop.addEventListener('click', () => $('upload').click());
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
  $('statusTitle').textContent = 'Brasil · mapa vetorial local';
  loadDemo();
})();
