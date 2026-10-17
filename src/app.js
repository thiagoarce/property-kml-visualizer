/* Property KML Visualizer — código público; nenhum dado institucional deve ser versionado. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { features: [], shapes: [], filtered: [], fileName: '', selected: null, group: '', search: '', osm: false, iconFilter: '', typeFilter: '', iconUrls: [], profile: 'generic' };
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

  const SEMANTIC_TYPES = {
    hall: 'Salão do Reino / local de reunião', empty: 'SR vazio (sem auditório)',
    residence: 'Residência', plot: 'Terreno', sale: 'Imóvel à venda',
    planned: 'Aprovado para futura venda', rented: 'Local alugado sem auditório',
    interdicted: 'SR interditado', other: 'Outros imóveis'
  };
  function getKmlStylePart(node, styles, styleMaps, partName, depth = 0) {
    if (!node || depth > 6) return null;
    const inline = child(node, 'Style') || (node.localName === 'Style' ? node : null);
    if (inline && child(inline, partName)) return child(inline, partName);
    const ref = directText(node, 'styleUrl').replace(/^.*#/, '');
    if (ref && styles.has(ref)) return getKmlStylePart(styles.get(ref), styles, styleMaps, partName, depth + 1);
    if (ref && styleMaps.has(ref)) {
      const pair = kids(styleMaps.get(ref), 'Pair');
      const normal = pair.find(p => directText(p, 'key') === 'normal') || pair[0];
      return getKmlStylePart(normal, styles, styleMaps, partName, depth + 1);
    }
    return null;
  }
  function identifyProperty(feature) {
    const href = String(feature.iconHref || '').toLocaleLowerCase('pt-BR');
    const path = feature.path.join(' / ').toLocaleLowerCase('pt-BR');
    const head = feature.description.slice(0, 19000).replace(/<[^>]*>/g, ' ').toLocaleLowerCase('pt-BR');
    // Primeiro as categorias explicitas no estilo ou nas pastas. Não classificar por cor.
    const candidate = (href + ' ' + path + ' ' + head);
    if (/interditad/.test(candidate)) return 'interdicted';
    if (/aprovad[oa].{0,25}futur[ao].{0,12}venda/.test(candidate)) return 'planned';
    if (/(?:terreno|land|plot).{0,25}(?:constru[çc][aã]o|construction)/.test(candidate) || /terreno|ground-overlay|plot[-_.]/.test(href)) return 'plot';
    if (/resid[eê]ncia|residence|residential/.test(candidate)) return 'residence';
    if (/sr vazio|sal[aã]o vazio|sem audit[oó]rio/.test(candidate)) return 'empty';
    if (/local alugado sem audit[oó]rio/.test(candidate)) return 'rented';
    if (/outros im[oó]veis|outro im[oó]vel/.test(candidate)) return 'other';
    if (/(?:sale[-_]?(?:symbol|dollar)|dollar|\$|icon[-_]?venda)/.test(href)) return 'sale';
    // Não deduzir condição de venda de uma casa comum; hall é o formato padrão SR.
    return 'hall';
  }
  function parseKmlColorLabel(node, styles, styleMaps) {
    const label = getKmlStylePart(node, styles, styleMaps, 'LabelStyle');
    return label ? xmlColor(directText(label,'color')) : null;
  }
  function getSaleStatus(feature) {
    const str = (feature.path.join(' / ') + ' ' + feature.description.slice(0, 4000)).toLocaleLowerCase('pt-BR');
    if (/aprovad[oa].{0,25}futur[ao].{0,12}venda/.test(str)) return 'Aprovado para futura venda';
    if (/im[oó]vel.{0,18}venda|pre[çc]o de venda/.test(str)) return 'Imóvel à venda';
    return '';
  }
  function getCaseStatus(feature) {
    const s = feature.description.slice(0, 14000).toLocaleLowerCase('pt-BR');
    if (/grandes projetos|grande projeto/.test(s)) return { label:'Grandes Projetos',color:'#c92632',level:'danger' };
    if (/pequena reforma/.test(s)) return { label:'Pequena Reforma',color:'#1db2c9',level:'info' };
    if (/caso aberto.{0,60}aluguel/.test(s)) return { label:'Aluguel',color:'#8c959c',level:'muted' };
    return null;
  }
  function visualMeaning(feature) {
    // Mapeamentos de negócio vêm da descrição/pastas e estilos KML, não de cores aleatórias.
    const type = feature.propertyType || 'hall';
    const sale = state.profile === 'vendas' ? getSaleStatus(feature) : '';
    const caseInfo = state.profile === 'srs' ? getCaseStatus(feature) : null;
    return { type, typeName: SEMANTIC_TYPES[type] || SEMANTIC_TYPES.hall, sale, caseInfo };
  }
  function escapeSvgText(text) {
    return String(text).replace(/[&<>"']/g, v => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]));
  }
  function semanticSvg(feature, size = 30) {
    const type = feature.propertyType || 'hall';
    const fill = /^#[0-9a-f]{6}$/i.test(feature.color) ? feature.color : '#32b35e';
    const stroke = '#172a31';
    const paths = {
      hall: '<path d="M4 13 16 3 28 13V29H4Z"/><path d="M4 13h24"/>',
      empty: '<path d="M4 13 16 3 28 13V29H4Z"/><path d="M7 18h18M7 23h18"/>',
      residence: '<path d="M4 13 16 3 28 13V29H4Z"/><path d="M13 29v-10h6v10M7 17h4v4H7M21 17h4v4h-4"/>',
      plot: '<rect x="5" y="5" width="22" height="22" rx="1"/>',
      rented: '<circle cx="16" cy="16" r="12"/><path d="M16 9v14M12 14h8"/>',
      sale: '<circle cx="16" cy="16" r="12"/><text x="16" y="21" font-size="16" text-anchor="middle" font-weight="900" stroke="none" fill="#fff">$</text>',
      planned: '<circle cx="16" cy="16" r="12"/><text x="16" y="21" font-size="16" text-anchor="middle" font-weight="900" stroke="none" fill="#fff">$</text>',
      other: '<path d="M16 4 30 28H2Z"/>',
      interdicted: '<path d="M16 3 30 29H2Z"/><path d="M16 11v8M16 23v1" stroke="#fff" stroke-width="3"/>'
    };
    let inner = paths[type] || paths.hall;
    if (type === 'sale' || type === 'planned') inner = inner.replace(/fill="#fff"/g,'fill="#fff"');
    const border = type === 'planned' ? '#c8242f' : stroke;
    return '<svg class="semantic-svg" viewBox="0 0 32 32" width="' + size + '" height="' + size +
      '" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="' + fill + '" stroke="' + border +
      '" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round">' + inner + '</g></svg>';
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
      const labelColor = parseKmlColorLabel(n, styles, styleMaps);
      const common = { name, path, color, labelColor, description, metadata, iconHref: href, iconKind, iconScale: iconInfo.scale || 1, styleName };
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
  function isSharePointUrl(raw) {
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' && u.hostname === 'jwsite.sharepoint.com';
    } catch (_) { return false; }
  }
  function isExternalChartUrl(raw) {
    try {
      const u = new URL(raw);
      return u.hostname === 'grafico-api.onrender.com';
    } catch (_) { return false; }
  }
  function copySafe(dst, node) {
    if (node.nodeType === Node.TEXT_NODE) { dst.appendChild(document.createTextNode(node.nodeValue || '')); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'img') {
      const src = node.getAttribute('src') || '';
      if (isSharePointUrl(src)) {
        const gallery = document.createElement('div');
        gallery.className = 'photo-action';
        const open = document.createElement('a');
        open.href = src;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.textContent = 'Abrir foto no SharePoint';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'photo-load-button';
        button.textContent = 'Carregar foto';
        button.addEventListener('click', () => {
          button.disabled = true;
          button.textContent = 'Carregando…';
          const img = new Image();
          img.className = 'sharepoint-photo';
          img.alt = node.getAttribute('alt') || 'Fotografia do SharePoint';
          img.referrerPolicy = 'no-referrer';
          img.loading = 'eager';
          img.onload = () => { button.remove(); gallery.classList.add('is-loaded'); };
          img.onerror = () => {
            img.remove();button.textContent='Tentar novamente';button.disabled=false;
            gallery.classList.add('photo-failed');
            const note=gallery.querySelector('.photo-error')||elText('span','photo-error','');
            note.textContent='Prévia indisponível neste navegador. Use o link do SharePoint para visualizar após o login.';
            if(!note.parentNode)gallery.append(note);
          };
          gallery.insertBefore(img, open);
          // A imagem só faz requisição ao SharePoint após este clique.
          img.src = src;
        });
        const photoName=elText('span','photo-caption',src.split('/').pop()?.split('?')[0]||'Imagem do SharePoint');
        gallery.append(photoName,button,open);
        dst.appendChild(gallery);
      }
      return;
    }
    if (BLOCKED_TAGS.has(tag)) return;
    const isAllowed = ALLOWED_TAGS.has(tag);
    const out = isAllowed ? document.createElement(tag) : dst;
    if (isAllowed) {
      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        if (href.startsWith('#') && /^[\w.-]{1,80}$/.test(href.slice(1))) out.dataset.kmlTarget = href.slice(1);
        if (isExternalChartUrl(href)) {
          const warning = document.createElement('span');
          warning.className = 'chart-external-warning';
          warning.textContent = 'Gráfico externo ainda não disponível nesta versão local';
          dst.appendChild(warning);
          return;
        }
        if (validLink(href)) {
          out.href = href;
          out.target = '_blank';
          out.rel = 'noopener noreferrer';
          if (!isSharePointUrl(href) && /^https:/i.test(href)) {
            out.addEventListener('click', event => {
              if (!window.confirm('Este link abre um serviço externo e pode transmitir informações contidas na URL. Deseja continuar?')) {
                event.preventDefault();
              }
            });
          }
        }
      }
      const classList = (node.getAttribute('class') || '').split(/\s+/).filter(x => /^[a-zA-Z_][\w-]{0,50}$/.test(x));
      if (classList.length) out.className = classList.slice(0, 8).join(' ');
      const id = node.getAttribute('id');
      if (id && /^[a-zA-Z_][\w-]{0,60}$/.test(id)) out.dataset.kmlId = id;
      if (tag === 'button') {
        out.type = 'button';
        const onclick = node.getAttribute('onclick') || '';
        // Reconhece os alvos de abas do HTML legado sem executar seu JavaScript.
        // Suporta openTab(event, 'local'), trocarAba('tab_local') e variações.
        const safeTabHandler = /(?:openTab|mostrarAba|showTab|trocarAba|switchTab|abrirAba|mostrarTab|setTab|selecionarAba|activateTab|mudarAba|trocarTab)\s*\(/i;
        const literals = [...onclick.matchAll(/['"]([^'"]{1,100})['"]/g)];
        if (safeTabHandler.test(onclick) && literals.length) out.dataset.kmlTarget = literals[literals.length - 1][1];
        const explicit = node.getAttribute('data-tab') || node.getAttribute('data-target') || node.getAttribute('aria-controls');
        if (explicit && /^[\w.-]{1,80}$/.test(explicit)) out.dataset.kmlTarget = explicit;
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
    if (state.profile !== 'generic') {
      const wrapper = document.createElement('div');
      wrapper.className = 'semantic-pin';
      wrapper.innerHTML = semanticSvg(feature, 30);
      const span = document.createElement('span');
      span.className = 'semantic-code';
      span.textContent = feature.name.match(/\b(?:BRA)?\d{3,6}[#*]?\b/i)?.[0] || feature.name.slice(0, 16);
      span.style.setProperty('--label-color',feature.labelColor || '#f8fafc');
      wrapper.appendChild(span);
      return L.divIcon({className:'map-pin map-pin-semantic',html:wrapper.outerHTML,iconSize:[32,34],iconAnchor:[16,17]});
    }
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
  function normalizeField(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function getFacts(feature) {
    const fields = new Map();
    function add(k,v) {
      const key=normalizeField(k);
      const val=String(v || '').replace(/\s+/g,' ').trim();
      if(key && val && val.length < 600 && !fields.has(key)) fields.set(key,val);
    }
    for(const [k,v] of Object.entries(feature.metadata)) add(k,v);
    const doc = new DOMParser().parseFromString(feature.description || '', 'text/html');
    const rows=doc.querySelectorAll('tr');
    for(const tr of rows) {
      const cells=[...tr.children].filter(c=>/^(TD|TH)$/.test(c.tagName));
      // Aceita tanto tabelas de 2 como de 4 colunas de formulário.
      for(let i=0;i+1<cells.length;i+=2) add(cells[i].textContent,cells[i+1].textContent);
    }
    return fields;
  }
  function fact(facts, ...keys) {
    for(const key of keys) {
      const v=facts.get(normalizeField(key));
      if(v && v !== '-' && v !== '—') return v;
    }
    return '';
  }
  function elText(tag,cls,content) {
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    e.textContent=String(content);
    return e;
  }
  function appendMetric(parent,label,value,major=false) {
    if(!value) return;
    const card=elText('div','metric-card'+(major?' metric-major':''),'');
    card.append(elText('span','metric-label',label),elText('strong','metric-value',value));
    parent.appendChild(card);
  }
  function renderOverview(feature,facts) {
    const wrapper=elText('section','property-overview','');
    const meaning=visualMeaning(feature);
    const top=elText('div','property-identity','');
    const pict=elText('span','property-symbol','');
    pict.innerHTML=semanticSvg(feature,34);
    const lines=elText('div','identity-text','');
    lines.append(elText('div','identity-kicker',state.profile==='vendas'?'PATRIMÔNIO · VENDAS':'PATRIMÔNIO · SRs'));
    lines.append(elText('strong','identity-title',meaning.typeName));
    top.append(pict,lines);
    wrapper.appendChild(top);
    const badges=elText('div','property-badges','');
    function badge(label,kind='') {
      if(label)badges.appendChild(elText('span','property-badge '+kind,label));
    }
    badge(fact(facts,'Tipo de Posse'));
    badge(fact(facts,'Status do Local','Status de Locação'));
    if(meaning.caseInfo)badge(meaning.caseInfo.label, meaning.caseInfo.level);
    if(meaning.sale)badge(meaning.sale,meaning.sale.startsWith('Aprovado')?'danger':'sale');
    const city=fact(facts,'Cidade');
    const rec=fact(facts,'REC');
    if(city)badge(city);
    if(badges.children.length)wrapper.appendChild(badges);
    if(rec)wrapper.appendChild(elText('div','identity-rec',rec));
    const grid=elText('div','metric-grid','');
    if(state.profile==='vendas') {
      appendMetric(grid,'Preço de venda',fact(facts,'Preço de venda','Preço','Valor de Venda'),true);
      appendMetric(grid,'Área do terreno',fact(facts,'Área do terreno','Área do Local'));
      appendMetric(grid,'Área construída',fact(facts,'Área construída','Área da Construção'));
      appendMetric(grid,'Tipo de posse',fact(facts,'Tipo de posse'));
    }else {
      appendMetric(grid,'Capacidade',fact(facts,'Capacidade','Capacidade primária','Capacidade do auditório'));
      appendMetric(grid,'Congregações',fact(facts,'Congregações locais','Qtd Congregações','Quantidade de congregações'));
      const uso=fact(facts,'Uso');
      if(/^\d{1,3}(?:[.,]\d+)?\s*%$/.test(uso))appendMetric(grid,'Uso',uso);
      appendMetric(grid,'Área do local',fact(facts,'Área do Local'));
      appendMetric(grid,'Próxima reforma',fact(facts,'Ano da próxima reforma','Próxima reforma'));
      appendMetric(grid,'Valor do prédio',fact(facts,'Valor do Prédio'));
    }
    if(grid.children.length)wrapper.appendChild(grid);
    const alert=fact(facts,'Casos Aberto','Caso Aberto','Condição do Prédio','Descrição do Status do Local');
    if(alert && !/^(?:nenhum\b|nenhuma\b|não\b|nao\b|sem caso\b)/i.test(alert)) {
      const row=elText('div','case-alert','');
      row.append(elText('span','case-alert-icon','!'),elText('span','',alert));
      wrapper.appendChild(row);
    }
    const actions=elText('div','property-actions','');
    const meta=elText('span','coordinate-text',
      feature.pos[0].toFixed(5)+', '+feature.pos[1].toFixed(5));
    actions.appendChild(meta);
    const links=[...new DOMParser().parseFromString(feature.description||'', 'text/html').querySelectorAll('a[href]')]
      .filter(a=>isSharePointUrl(a.getAttribute('href')||''));
    if(links.length) {
      const link=document.createElement('a');
      link.href=links[0].href;
      link.target='_blank';
      link.rel='noopener noreferrer';
      link.textContent='Abrir no SharePoint ↗';
      link.className='overview-sharepoint-link';
      actions.appendChild(link);
    }
    wrapper.appendChild(actions);
    return wrapper;
  }
  function enhanceLocalCharts(root) {
    // Usa SOMENTE séries numéricas já presentes nas tabelas do KML.
    // Não recupera dados da API externa de gráficos nem inventa valores.
    for(const panel of root.querySelectorAll('.tabcontent,.tab-panel,.tab-pane,.legacy-section[data-section]')) {
      const title=(panel.getAttribute('data-section') || '') + ' ' +(panel.getAttribute('data-kml-id') || '') + ' ' +
        (panel.previousElementSibling?.textContent || '');
      const isGraph=/gr[aá]fic|proje|hist[oó]ric|chart/i.test(title) ||
        /gr[aá]fic|proje|hist[oó]ric/i.test(panel.textContent.slice(0,160));
      if(!isGraph) continue;
      const years=[];
      for(const tr of panel.querySelectorAll('tr')) {
        const td=tr.querySelectorAll('td,th');
        if(td.length<2)continue;
        const year=td[0].textContent.trim(),val=td[1].textContent.trim();
        if(!/^20\d{2}$/.test(year))continue;
        const number=Number(val.replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,''));
        if(Number.isFinite(number)&&number>=0)years.push({year,value:number});
      }
      if(years.length < 2 || years.length > 40) continue;
      const max=Math.max(1,...years.map(p=>p.value));
      const min=Math.max(0,Math.min(...years.map(p=>p.value))*.9);
      const height=175,width=500;
      const points=years.map((p,i)=>{
        const x=35+i*(width-55)/Math.max(1,years.length-1);
        const y=height-28-(p.value-min)/Math.max(1,max-min)*(height-48);
        return [x,y];
      });
      const ns='http://www.w3.org/2000/svg';
      const svg=document.createElementNS(ns,'svg');
      svg.setAttribute('viewBox','0 0 500 175');
      svg.setAttribute('role','img');
      svg.setAttribute('aria-label','Gráfico local: '+years.length+' pontos anuais');
      svg.classList.add('local-chart-svg');
      const axis=document.createElementNS(ns,'path');
      axis.setAttribute('d','M35 10V147H480');
      axis.setAttribute('stroke','#b6cbd3');axis.setAttribute('stroke-width','1.2');axis.setAttribute('fill','none');
      svg.appendChild(axis);
      const line=document.createElementNS(ns,'polyline');
      line.setAttribute('points',points.map(p=>p.join(',')).join(' '));
      line.setAttribute('fill','none');line.setAttribute('stroke','#188ba8');
      line.setAttribute('stroke-width','3');line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');
      svg.appendChild(line);
      years.forEach((p,i)=>{
        const c=document.createElementNS(ns,'circle');
        c.setAttribute('cx',points[i][0]);c.setAttribute('cy',points[i][1]);
        c.setAttribute('r','4');c.setAttribute('fill','#168aa6');
        const tip=document.createElementNS(ns,'title');
        tip.textContent=p.year+': '+p.value.toLocaleString('pt-BR');
        c.appendChild(tip);svg.appendChild(c);
        if(i===0||i===years.length-1||i%Math.ceil(years.length/5)===0) {
          const t=document.createElementNS(ns,'text');
          t.setAttribute('x',points[i][0]);t.setAttribute('y','166');
          t.setAttribute('fill','#638190');t.setAttribute('font-size','10');t.setAttribute('text-anchor','middle');
          t.textContent=p.year;svg.appendChild(t);
        }
      });
      const chart=elText('section','local-chart','');
      chart.append(elText('strong','','Evolução histórica — dados do arquivo'),svg);
      panel.insertBefore(chart,panel.firstChild);
    }
  }
  // Painel SRs/Vendas: o resumo novo vem primeiro; o HTML legado não é duplicado
  // nem despejado ao longo da página. Ele continua disponível sob demanda.
  function updateDetailPreferences() {
    const detail=$('detailBody');
    detail.classList.toggle('hide-metrics',!$('showMetrics').checked);
    detail.classList.toggle('hide-empty-fields',!$('showEmptyFields').checked);
    for(const cell of detail.querySelectorAll('.detail-field,.detail-group-row')) {
      if(cell.classList.contains('detail-group-row')) continue;
      const value=cell.querySelector('.detail-field-value');
      if(!value) continue;
      const hasValue=!!value.textContent.trim()||!!value.querySelector('img,a[href],.photo-action,.local-chart');
      cell.classList.toggle('field-is-empty',!hasValue);
    }
    for(const row of detail.querySelectorAll('.description tr,.legacy-section tr,.legacy-source tr')) {
      const cells=[...row.children].filter(n=>n.tagName==='TD');
      if(!cells.length)continue;
      const values=cells.filter((n,i)=>i%2===1);
      const hasContent=values.some(n=>n.textContent.trim()||n.querySelector('img,a[href],button'));
      row.classList.toggle('field-is-empty',!!values.length&&!hasContent);
    }
  }
  function normalizedTabLabel(label) {
    const short=String(label||'').replace(/\s+/g,' ').trim();
    if(/^resumo$/i.test(short))return 'Resumo do KML';
    if(/^dados completos?$/i.test(short))return 'Dados completos';
    if(/^nomes e contatos$/i.test(short))return 'Contatos';
    if(/^gr[aá]ficos e proje[cç][oõ]es$/i.test(short))return 'Gráficos';
    return short.slice(0,40)||'Detalhes';
  }
  function getTabControls(root) {
    const tabBars=[...root.querySelectorAll('.tabs,.tab-buttons,.tab-nav,.tabbar,.tab-menu,[role="tablist"],.botoes-abas')];
    let buttons=tabBars.flatMap(bar=>[...bar.querySelectorAll('button,a')]).filter(b=>b.textContent.trim());
    if(!buttons.length) {
      // Alguns geradores montam a navegação sem uma div com classe "tabs".
      buttons=[...root.querySelectorAll('button[data-kml-target],a[data-kml-target],button.tablink,button.tablinks,button.aba')];
    }
    return [...new Set(buttons)].filter(n=>n.textContent.trim());
  }
  function getLegacySections(description) {
    const controls=getTabControls(description);
    if(!controls.length)return [];
    const classes='.tabcontent,.tab-content,.tab-pane,.tab-panel,.tabContent,.tabPage,.aba-content,.aba-conteudo,.conteudo-aba,.content-tab,.painel-aba,[role="tabpanel"]';
    const known=new Set([...description.querySelectorAll(classes)]);
    const identified=[...description.querySelectorAll('[data-kml-id]')];
    const idMap=new Map();
    for(const n of identified) {
      if(!idMap.has(n.dataset.kmlId))idMap.set(n.dataset.kmlId,n);
    }
    const used=new Set();
    const sections=[];
    function targetKey(str) {
      return normalizeField(String(str||'').replace(/^(?:tab|aba|panel|painel|content|conteudo)[-_ ]*/i,''));
    }
    for(let i=0;i<controls.length;i++) {
      const button=controls[i];
      const label=normalizedTabLabel(button.textContent);
      const direct=button.dataset.kmlTarget||'';
      const matches=[direct, 'tab-'+direct,'tab_'+direct,'aba-'+direct,'aba_'+direct, 'content-'+direct,
        'tab-'+normalizeField(label).replace(/\s+/g,'-'),normalizeField(label).replace(/\s+/g,'')];
      let panel=matches.map(name=>idMap.get(name)||null).find(n=>n&&!used.has(n))||null;
      const candidateKey=targetKey(direct||label);
      if(!panel && candidateKey) {
        panel=identified.find(n=>!used.has(n)&&targetKey(n.dataset.kmlId)===candidateKey)||null;
      }
      if(!panel) {
        panel=[...known].find(n=>!used.has(n) && (
          (direct && targetKey(n.dataset.kmlId)===targetKey(direct)) ||
          (candidateKey && targetKey(n.dataset.kmlId)===candidateKey)
        ))||null;
      }
      if(!panel) {
        const candidates=[...known].filter(n=>!used.has(n)&&!controls.some(b=>n.contains(b)));
        if(candidates.length >= controls.length-i)panel=candidates[0];
      }
      if(panel && !used.has(panel)) {
        used.add(panel);
        sections.push({label,node:panel});
      }
    }
    // Caso comum dos geradores: botões de aba válidos, mas conteúdo em blocos
    // não identificados pelo seletor tradicional. Preserva dados sem inventar abas.
    return sections;
  }
  function legacyFieldTable(table) {
    const rows=[...table.rows].filter(tr=>tr.closest('table')===table);
    if(!rows.length||rows.length>160)return false;
    const cellsByRow=rows.map(row=>[...row.children].filter(c=>c.tagName==='TD'||c.tagName==='TH'));
    if(cellsByRow.some(cells=>cells.some(cell=>cell.querySelector('table'))))return false;
    const pairs=cellsByRow.filter(cells=>cells.length===2||cells.length===4);
    if(!pairs.length||pairs.length<Math.ceil(rows.length*.55))return false;
    // Tabelas com cabeçalhos são listas: congregações, projeções, históricos etc.
    if(cellsByRow.some(cells=>cells.some(cell=>cell.tagName==='TH')))return false;
    // Séries históricas também podem vir sem TH: ano e valor devem seguir tabulares.
    if(cellsByRow.filter(cells=>/^20\d{2}$/.test(cells[0]?.textContent.trim()||'')).length>=2)return false;
    const textKeys=pairs.flatMap(cells=>cells.filter((_,i)=>i%2===0).map(c=>c.textContent.trim()));
    const shortLabels=textKeys.filter(x=>x.length>0&&x.length<100).length;
    return shortLabels>=Math.ceil(textKeys.length*.65);
  }
  function formatLegacyContent(content) {
    for(const table of [...content.querySelectorAll('table')]) {
      // Os painéis ainda não estão inseridos no DOM nesta etapa.
      if(!table.parentNode||table.closest('.detail-facts'))continue;
      if(!legacyFieldTable(table)) {
        const shell=elText('div','table-scroll','');
        table.classList.add('detail-data-table');
        table.parentNode.insertBefore(shell,table);
        shell.appendChild(table);
        continue;
      }
      const grid=elText('div','detail-facts','');
      let destination=grid;
      const rows=[...table.rows].filter(tr=>tr.closest('table')===table);
      for(const row of rows) {
        const cells=[...row.children].filter(c=>c.tagName==='TD'||c.tagName==='TH');
        if(cells.length===1) {
          const label=cells[0].textContent.trim();
          const isAccordion=/^detalhes (?:do|da|de|sobre)\b/i.test(label);
          if(isAccordion){
            const accordion=document.createElement('details');
            accordion.className='detail-accordion';
            const summary=elText('summary','',label.replace(/^▸\s*/,''));
            const inner=elText('div','detail-accordion-body detail-facts','');
            accordion.append(summary,inner);
            grid.append(accordion);
            destination=inner;
          }else{
            destination=grid;
            grid.append(elText('div','detail-group-row',label));
          }
          continue;
        }
        if(cells.length!==2&&cells.length!==4) {
          const original=elText('div','detail-unstructured','');
          original.textContent=row.textContent.trim();
          if(original.textContent)destination.appendChild(original);
          continue;
        }
        for(let i=0;i<cells.length;i+=2) {
          const label=cells[i].textContent.trim();
          if(!label&&!cells[i+1].textContent.trim())continue;
          const field=elText('div','detail-field','');
          field.appendChild(elText('dt','detail-field-label',label||'Informação'));
          const value=elText('dd','detail-field-value','');
          value.append(...[...cells[i+1].childNodes].map(c=>c.cloneNode(true)));
          field.appendChild(value);
          destination.appendChild(field);
        }
      }
      table.replaceWith(grid);
    }
    for(const button of [...content.querySelectorAll('button')]) {
      if(button.classList.contains('photo-load-button')||button.classList.contains('legacy-reveal'))continue;
      if(!button.closest('.detail-group-row'))continue;
      // Controles de expansão do HTML do Google Earth não funcionam aqui;
      // transformamos o texto em subtítulo, não em botão falso.
      button.replaceWith(elText('span','detail-subheading',button.textContent));
    }
    updateDetailPreferences();
  }
  function enhanceMediaSections(view,label) {
    if(/fotos|imagens|galeria/i.test(label)){
      const photos=[...view.querySelectorAll('.photo-action')];
      if(photos.length){
        const header=elText('div','gallery-toolbar','');
        header.appendChild(elText('strong','',photos.length+' foto(s) vinculada(s)'));
        const all=elText('button','gallery-load','Carregar prévias');
        all.type='button';
        all.addEventListener('click',()=>{
          const buttons=photos.map(p=>p.querySelector('.photo-load-button')).filter(Boolean);
          buttons.forEach((b,i)=>setTimeout(()=>{if(b.isConnected&&!b.disabled)b.click()},i*250));
          all.remove();
        });
        header.append(all);
        const gallery=elText('div','photo-gallery','');
        for(const p of photos)gallery.appendChild(p);
        view.prepend(header,gallery);
      }
    }
    if(/gr[aá]fic|proje/i.test(label)){
      for(const button of [...view.querySelectorAll('button')]){
        if(/^(ajustar gr[aá]ficos|padr[aã]o|recente|detalhada|aplicar a todas|c[aá]lculos detalhados)$/i.test(button.textContent.trim()))
          button.remove();
      }
      for(const node of [...view.querySelectorAll('*')]){
        if(node.children.length===0&&/carregando gr[aá]fico/i.test(node.textContent))
          node.textContent='';
      }
      const warnings=[...view.querySelectorAll('.chart-external-warning')];
      if(warnings.length){
        const notice=elText('div','graph-notice',
          'Os gráficos completos exigem séries históricas que ainda não estão incluídas neste KML. Nenhum dado foi enviado a serviços externos.');
        warnings[0].replaceWith(notice);
        warnings.slice(1).forEach(n=>n.remove());
      }
      const content=view.textContent.replace(/\s+/g,' ');
      const keys=['Capacidade primária','Assistência base média','Necessários hoje (90%)','Com até 20% remoto'];
      const metrics=elText('div','graph-kpis','');
      for(const key of keys){
        const pattern=new RegExp(key.replace(/[()]/g,'\\$&')+'\\s*[:–-]?\\s*(\\d{1,6})','i');
        const value=content.match(pattern)?.[1];
        if(value){
          const card=elText('div','graph-kpi','');
          card.append(elText('small','',key),elText('strong','',Number(value).toLocaleString('pt-BR')));
          metrics.append(card);
        }
      }
      if(metrics.children.length)view.prepend(metrics);
    }
  }
  function renderDomainDetail(feature,body) {
    const overview=renderOverview(feature,getFacts(feature));
    const description=safeDescription(feature.description);
    const sections=getLegacySections(description);
    const nav=elText('nav','property-nav','');
    nav.setAttribute('aria-label','Seções do imóvel');
    const host=elText('div','property-sections','');
    const entries=[{label:'Visão geral',root:elText('section','property-view property-main','')}];
    entries[0].root.appendChild(overview);
    const seen=new Set();
    for(const section of sections) {
      const original=section.label;
      let label=original,idx=2;
      while(seen.has(label)||label==='Visão geral')label=original+' '+idx++;
      seen.add(label);
      const view=elText('section','property-view legacy-section','');
      view.dataset.section=label;
      // Retira o painel do HTML sanitizado, preservando apenas seu conteúdo.
      const panel=section.node;
      view.append(...[...panel.childNodes]);
      formatLegacyContent(view);
      enhanceMediaSections(view,label);
      entries.push({label,root:view});
    }
    if(!sections.length&&feature.description.trim()) {
      const view=elText('section','property-view legacy-section','');
      // Remover barras de navegação legada que ficariam mortas.
      for(const bar of description.querySelectorAll('.tabs,.tab-nav,.tab-buttons,.tabbar,[role="tablist"]'))bar.remove();
      view.append(...[...description.childNodes]);
      formatLegacyContent(view);
      entries.push({label:'Informações',root:view});
    }
    if(feature.description.trim()) {
      const original=elText('section','property-view legacy-source','');
      const trigger=elText('button','legacy-reveal','Mostrar conteúdo original do KML');
      trigger.type='button';
      original.append(trigger,elText('p','legacy-help',
        'Consulta técnica dos campos originais; os dados não são enviados à internet.'));
      trigger.addEventListener('click',()=>{
        trigger.remove();
        const raw=safeDescription(feature.description);
        original.appendChild(raw);
        activateTabs(raw);
        updateDetailPreferences();
      },{once:true});
      const existing=seen.has('Dados completos');
      entries.push({label:existing?'Fonte do KML':'Dados completos',root:original});
    }
    function activate(index) {
      entries.forEach((entry,i)=>{
        entry.root.hidden=i!==index;
        const tab=nav.children[i];
        tab.classList.toggle('is-active',i===index);
        tab.setAttribute('aria-selected',i===index?'true':'false');
        tab.tabIndex=i===index?0:-1;
      });
      body.scrollTop=0;
    }
    entries.forEach((entry,index)=>{
      entry.root.hidden=index!==0;
      const button=elText('button','property-nav-tab',entry.label);
      button.type='button';
      button.setAttribute('role','tab');
      button.setAttribute('aria-selected',index===0?'true':'false');
      button.tabIndex=index===0?0:-1;
      button.addEventListener('click',()=>activate(index));
      button.addEventListener('keydown',event=>{
        if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft'&&event.key!=='Home'&&event.key!=='End')return;
        event.preventDefault();
        const next=event.key==='Home'?0:event.key==='End'?entries.length-1:
          (index+(event.key==='ArrowRight'?1:-1)+entries.length)%entries.length;
        nav.children[next].focus();
        activate(next);
      });
      nav.appendChild(button);
      host.appendChild(entry.root);
    });
    nav.setAttribute('role','tablist');
    body.append(nav,host);
    enhanceLocalCharts(host);
    updateDetailPreferences();
  }
  function showDetail(feature) {
    state.selected=feature;
    $('detailTitle').textContent=feature.name;
    $('detailSubtitle').textContent=feature.path.join(' / ')||'Sem pasta';
    const body=$('detailBody');
    body.replaceChildren();
    if(state.profile!=='generic') {
      renderDomainDetail(feature,body);
    }else{
      body.appendChild(elText('div','metadata',
        'Latitude '+feature.pos[0].toFixed(5)+' · Longitude '+feature.pos[1].toFixed(5)));
      body.appendChild(safeDescription(feature.description));
      const md=Object.entries(feature.metadata);
      if(md.length&&!feature.description.trim()){
        const table=document.createElement('table');
        for(const [k,v] of md){const tr=table.insertRow();tr.insertCell().textContent=k;tr.insertCell().textContent=v;}
        body.appendChild(table);
      }
      activateTabs(body);
    }
    $('detail').hidden=false;
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
      if (state.profile === 'generic') dot.appendChild(markerSymbol(mark.iconKind || 'circle', mark.color, mark.iconUrl));
      else dot.innerHTML = semanticSvg(mark, 21);
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
  function mapProfile(name, features) {
    const title = String(name || '').toLocaleLowerCase('pt-BR');
    if (/\bvendas?\b|im[oó]ve(?:l|is)\s+(?:à|a)\s+venda/.test(title)) return 'vendas';
    if (/^srs?(?:\.kml|\.kmz)?$|sal[oõ]es\s+do\s+reino/.test(title)) return 'srs';
    const paths = features.slice(0, Math.min(features.length, 40)).map(f => f.path.join(' / ').toLocaleLowerCase('pt-BR')).join(' ');
    if (/im[oó]ve(?:l|is)\s+(?:à|a)\s+venda/.test(paths)) return 'vendas';
    if (/(?:macros?\s*\d+).*(?:rec\s|representa)/.test(paths) && features.length > 50) return 'srs';
    return 'generic';
  }
  function setWorkspace(name) {
    const valid=['locais','filtros','legenda'].includes(name)?name:'locais';
    for(const button of document.querySelectorAll('.workspace-tab')){
      const active=button.dataset.workspace===valid;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-selected',String(active));
    }
    $('workspaceLocais').hidden=valid!=='locais';
    $('territoryPanel').hidden=valid!=='filtros';
    $('workspaceLegend').hidden=valid!=='legenda';
  }
  function showProfile() {
    const legend = $('mapLegend');
    legend.querySelector('.semantic-legend')?.remove();
    document.body.dataset.mapProfile = state.profile;
    $('legendFooter').hidden=state.profile !== 'generic';
    if(state.profile==='generic')return;
    const head=elText('div','semantic-legend','');
    head.append(elText('strong','',state.profile==='srs'?'LEGENDA · SALÕES DO REINO':'LEGENDA · IMÓVEIS À VENDA'),
      elText('p','',state.profile==='srs'
        ? 'Forma = imóvel · preenchimento = congregações · rótulo = status.'
        : 'Forma = imóvel · cor = situação da venda.'));
    legend.insertBefore(head,$('legendEntries'));
  }
  function semanticLegendLine(label,color,svg,type,count) {
    const btn=document.createElement('div');
    btn.className='meaning-line';
    const picture=elText('span','meaning-symbol','');
    if(svg)picture.innerHTML=svg;
    else {const sw=elText('span','meaning-color','');sw.style.background=color||'#ccc';picture.append(sw);}
    btn.append(picture,elText('span','meaning-label',label));
    if(count!==null && count!==undefined)btn.append(elText('span','meaning-total',count.toLocaleString('pt-BR')));
    return btn;
  }
  function renderSemanticLegend(box) {
    box.replaceChildren();
    const grouped=new Map();
    for(const f of state.features)grouped.set(f.propertyType||'hall',(grouped.get(f.propertyType||'hall')||0)+1);
    const section=(title)=>{const item=elText('div','meaning-group','');item.append(elText('div','meaning-group-title',title));box.append(item);return item};
    const shapes=section('FORMATO · TIPO DO IMÓVEL');
    let types=state.profile==='srs'
      ? ['hall','plot','sale','planned','rented','other','interdicted','residence','empty']
      : ['hall','empty','residence','plot','sale','planned'];
    for(const type of types){
      const count=grouped.get(type)||0;
      const demo={propertyType:type,color:state.profile==='vendas'?'#31c64a':'#39ca65'};
      const name=SEMANTIC_TYPES[type]||type;
      shapes.append(semanticLegendLine(name,null,semanticSvg(demo,23),type,count));
    }
    if(state.profile==='srs'){
      const colors=section('PREENCHIMENTO · CONGREGAÇÕES NO PRÉDIO');
      for(const [name,color] of [
        ['1 congregação','#960000'],['2 congregações','#ffee00'],['3 congregações','#02db11'],
        ['4 congregações','#1248ea'],['5 ou mais','#101010'],['Única congregação da cidade','#ffa400']
      ]) colors.append(semanticLegendLine(name,color,'',null,null));
      const statuses=section('COR DO RÓTULO · STATUS DO CASO');
      for(const [name,color] of [
        ['Sem caso (anterior ao programa / alugado)','#ffffff'],
        ['Sem caso · próprio após 1999','#20e236'],
        ['Caso aberto · Grandes Projetos','#f22c32'],
        ['Caso aberto · Pequena Reforma','#04d2d5'],
        ['Caso aberto · Aluguel','#99999b']
      ])statuses.append(semanticLegendLine(name,color,'',null,null));
    }else{
      const colors=section('COR · SITUAÇÃO DA VENDA');
      colors.append(semanticLegendLine('Imóvel à venda','#15e339','',null,null));
      colors.append(semanticLegendLine('Aprovado para futura venda','#eb3434','',null,null));
    }
    $('legendCount').textContent=state.features.length.toLocaleString('pt-BR')+' locais';
    $('legendClear').hidden=true;
  }
  function renderLegend() {
    const box=$('legendEntries');
    if(!box)return;
    if(state.profile !== 'generic'){renderSemanticLegend(box);return;}
    box.replaceChildren();
    const counts=new Map();
    for(const f of state.features){
      const key=iconKey(f);
      if(!counts.has(key))counts.set(key,{key,feature:f,count:0});
      counts.get(key).count++;
    }
    const items=[...counts.values()].sort((a,b)=>b.count-a.count);
    $('legendCount').textContent=items.length+' tipos';
    for(const item of items){
      const f=item.feature,btn=elText('button','legend-entry'+(state.iconFilter===item.key?' is-selected':''),'');
      btn.type='button';
      btn.title=f.styleName||'Símbolo do arquivo';
      const picture=elText('span','legend-icon','');
      picture.appendChild(markerSymbol(f.iconKind||'circle',f.color,f.iconUrl));
      btn.append(picture,elText('span','legend-name',f.styleName||colorName(f.color)),
        elText('span','legend-item-count',item.count.toLocaleString('pt-BR')));
      btn.addEventListener('click',()=>{state.iconFilter=state.iconFilter===item.key?'':item.key;updateFilters(false)});
      box.appendChild(btn);
    }
    $('legendClear').hidden=!state.iconFilter;
  }

  // Índice de análise totalmente local. A malha pública dos estados já está
  // incorporada ao HTML; não usamos geocoding, IA ou servidores de consulta.
  const UF_CODES = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
  function stateRegions() {
    function ringsOf(geometry) {
      if (!geometry) return [];
      if (geometry.type === 'Polygon') return [geometry.coordinates];
      if (geometry.type === 'MultiPolygon') return geometry.coordinates;
      return [];
    }
    return BRAZIL_STATES_GEOJSON.features.map(f => {
      const polygons = ringsOf(f.geometry).map(poly => poly.map(ring => {
        const xs=ring.map(c=>c[0]), ys=ring.map(c=>c[1]);
        return {ring,bbox:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
      }));
      const all=polygons.flat().map(p=>p.bbox);
      return { uf:f.properties?.sigla, polygons, bbox:[
        Math.min(...all.map(b=>b[0])),Math.min(...all.map(b=>b[1])),
        Math.max(...all.map(b=>b[2])),Math.max(...all.map(b=>b[3]))
      ] };
    }).filter(x=>UF_CODES.includes(x.uf));
  }
  const regions=stateRegions();
  function ringContains(ring,lon,lat) {
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const x=ring[i][0],y=ring[i][1],a=ring[j][0],b=ring[j][1];
      if((y>lat)!==(b>lat) && lon<(a-x)*(lat-y)/(b-y)+x)inside=!inside;
    }
    return inside;
  }
  function stateFromCoordinates(pos) {
    const [lat,lon]=pos;
    for(const r of regions) {
      const b=r.bbox;
      if(lon<b[0]||lon>b[2]||lat<b[1]||lat>b[3])continue;
      for(const poly of r.polygons) {
        if(!poly.length)continue;
        const outer=poly[0],box=outer.bbox;
        if(lon<box[0]||lon>box[2]||lat<box[1]||lat>box[3])continue;
        if(!ringContains(outer.ring,lon,lat))continue;
        if(!poly.slice(1).some(h=>ringContains(h.ring,lon,lat)))return r.uf;
      }
    }
    return '';
  }
  function extractUF(f) {
    const source=Object.entries(f.metadata||{});
    for(const [key,value] of source) {
      const k=normalizeField(key);
      if(!['uf','estado','sigla do estado','estado uf','cidade uf'].includes(k))continue;
      const s=String(value||'').trim().toUpperCase();
      const matched=s.match(/(?:^|\/\s*|\b)(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)\b/);
      if(matched)return matched[1];
    }
    // UF geográfica é preferível a confundir abreviações dentro do nome do REC.
    return stateFromCoordinates(f.pos);
  }
  function extractMacro(f) {
    const found=f.path.find(x=>/^macro\s*\d+\b/i.test(x));
    if(found)return (found.match(/macro\s*\d+/i)||[])[0]?.replace(/^macro/i,'Macro')||'';
    for(const [k,v] of Object.entries(f.metadata||{}))if(normalizeField(k)==='macro')return String(v).trim();
    return '';
  }
  function extractREC(f) {
    const found=f.path.find(x=>/^REC[\s_-]/i.test(x));
    if(found)return found.replace(/\s*\(\d+\)\s*$/,'').trim();
    for(const [k,v] of Object.entries(f.metadata||{}))if(normalizeField(k)==='rec')return String(v).trim();
    return '';
  }
  function exactCongregations(f) {
    for(const [k,v] of Object.entries(f.metadata||{})){
      if(!/^(?:qtd|quantidade|n[uú]mero|total|congrega(?:ç|c)(?:õ|o)es locais)/i.test(normalizeField(k)))continue;
      if(!/congreg/.test(normalizeField(k)))continue;
      if(/^\s*\d{1,3}\s*$/.test(String(v)))return Number(v);
    }
    const fragment=String(f.description||'').slice(0,90000);
    // Extrai somente valores explicitamente nomeados no formulário do KML.
    const html=fragment.match(/(?:congrega(?:ç|c)(?:õ|o)es locais|quantidade de congrega(?:ç|c)(?:õ|o)es|qtd(?:\.| de)? congrega(?:ç|c)(?:õ|o)es)\s*<\/t[dh]>\s*<t[dh][^>]*>\s*(\d{1,3})\s*</i);
    if(html)return Number(html[1]);
    const plain=fragment.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    const direct=plain.match(/(?:quantidade de congrega(?:ç|c)(?:õ|o)es|congrega(?:ç|c)(?:õ|o)es locais)\s*[:=]\s*(\d{1,3})(?:\s|$)/i);
    return direct?Number(direct[1]):null;
  }
  function countBucket(f,exact) {
    if(exact!==null&&exact!==undefined) return exact>=5?'5+':String(exact);
    const value=String(f.color||'').toLowerCase();
    if(!/^#[0-9a-f]{6}$/.test(value))return '';
    const rgb=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
    const colors=[['1',[153,0,0]],['2',[255,255,0]],['3',[0,255,0]],['4',[0,0,255]],['5+',[0,0,0]],['unique',[255,165,0]]];
    const sorted=colors.map(([key,p])=>({key,dist:Math.hypot(...rgb.map((x,i)=>x-p[i]))})).sort((a,b)=>a.dist-b.dist);
    return sorted[0].dist<=85?sorted[0].key:'';
  }
  function categoryStatus(f) {
    if(state.profile==='vendas')return getSaleStatus(f) || 'Não informado';
    const color=String(f.labelColor||'').toLowerCase();
    if(/^#[0-9a-f]{6}$/.test(color)){
      const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
      if(r>190&&g<120&&b<140)return 'Grandes Projetos';
      if(g>150&&b>150&&r<145)return 'Pequena Reforma';
      if(Math.abs(r-g)<35&&Math.abs(g-b)<35&&r>90&&r<205)return 'Aluguel';
      if(g>135&&r<125&&b<150)return 'Sem caso · próprio pós-1999';
      if(r>210&&g>210&&b>210)return 'Sem caso';
    }
    return getCaseStatus(f)?.label||'Não informado';
  }
  function enrichFeature(f) {
    f.analysis={
      uf:extractUF(f),macro:extractMacro(f),rec:extractREC(f),
      exact:state.profile==='srs' ? exactCongregations(f) : null,
      bucket:'',status:categoryStatus(f)
    };
    f.analysis.bucket=state.profile==='srs' ? countBucket(f,f.analysis.exact):'';
  }
  function appendOptions(select, values, allText) {
    const chosen=select.value;
    select.replaceChildren();
    const all=document.createElement('option');all.value='';all.textContent=allText;
    select.append(all);
    for(const v of values){
      if(!v)continue;
      const option=document.createElement('option');
      option.value=v;option.textContent=v;select.append(option);
    }
    if(values.includes(chosen))select.value=chosen;
  }
  function buildAnalysisOptions() {
    const fields=state.features.map(f=>f.analysis||{});
    const unique=(key)=>[...new Set(fields.map(x=>x[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
    appendOptions($('stateFilter'),unique('uf'),'Todas as UFs');
    appendOptions($('macroFilter'),unique('macro'),'Todas as Macros');
    appendOptions($('recFilter'),unique('rec'),'Todos os RECs');
    const types=[...new Set(state.features.map(x=>x.propertyType).filter(Boolean))];
    const typeOptions=$('propertyFilter');
    typeOptions.replaceChildren();
    const first=document.createElement('option');first.value='';first.textContent='Todos os tipos';typeOptions.append(first);
    for(const key of types){const op=document.createElement('option');op.value=key;op.textContent=SEMANTIC_TYPES[key]||key;typeOptions.append(op);}
    appendOptions($('caseFilter'),unique('status'),'Todas as situações');
    $('congFilter').disabled=state.profile!=='srs';
    $('analysisResult').hidden=true;
    $('groupStats').hidden=true;
  }
  function clearAnalysis() {
    for(const name of ['stateFilter','macroFilter','recFilter','propertyFilter','congFilter','caseFilter','groupBy']){
      $(name).value='';
    }
    $('search').value='';
    $('groups').value='';
    $('question').value='';
    $('questionHint').textContent='Busca local por critérios reconhecidos. Não usa IA nem envia o KML.';
    state.typeFilter='';state.iconFilter='';
    updateFilters(true);
  }
  function interpretQuestion(question) {
    const q=normalizeField(question);
    if(!q)return;
    const detected=[];
    // Nova pergunta substitui os critérios da pergunta anterior, não os acumula.
    for(const id of ['stateFilter','macroFilter','recFilter','propertyFilter','congFilter','caseFilter','groupBy'])$(id).value='';
    $('groups').value='';state.typeFilter='';state.iconFilter='';
    // Reconhece consultas limitadas. Não envia texto à IA nem executa código do usuário.
    const uf=(q.match(/\b(?:em|no|na|de|do|estado de)\s+(ac|al|am|ap|ba|ce|df|es|go|ma|mg|ms|mt|pa|pb|pe|pi|pr|rj|rn|ro|rr|rs|sc|se|sp|to)\b/)||[])[1];
    if(uf){$('stateFilter').value=uf.toUpperCase();detected.push('UF '+uf.toUpperCase());}
    const macro=q.match(/\bmacro\s*(\d{1,2})\b/);
    if(macro) {
      const item=[...$('macroFilter').options].find(x=>normalizeField(x.value)===('macro '+macro[1]));
      if(item){$('macroFilter').value=item.value;detected.push(item.value);}
    }
    let threshold='';
    if(/\bmais de\s*5\b|\b(?:acima de|superior a)\s*5\b|\b(?:6 ou mais|6\+)\b/.test(q))threshold='6+';
    else if(/\b(?:5 ou mais|pelo menos 5|5\+)\b/.test(q))threshold='5+';
    else if(/\b(?:uma|1)\s+congregac/.test(q))threshold='1';
    if(threshold&&state.profile==='srs'){
      $('congFilter').value=threshold;
      detected.push(threshold==='6+'?'Mais de 5 congregações (candidatos incluídos)':'5 ou mais congregações');
    }
    const status= q.includes('grandes projetos')?'Grandes Projetos':
      q.includes('pequena reforma')?'Pequena Reforma':
      q.includes('aprovado para futura venda')?'Aprovado para futura venda':'';
    if(status&&[...$('caseFilter').options].some(o=>o.value===status)){
      $('caseFilter').value=status;detected.push(status);
    }
    if(/\b(?:saloes|salao|salas de reuniao)\b/.test(q)){
      if([...$('propertyFilter').options].some(x=>x.value==='hall')){
        $('propertyFilter').value='hall';detected.push('Salões do Reino');
      }
    }
    if(/\bterrenos?\b/.test(q)) {
      if([...$('propertyFilter').options].some(x=>x.value==='plot')){
        $('propertyFilter').value='plot';detected.push('Terrenos');
      }
    }
    if(!detected.length) {
      $('questionHint').textContent='Não reconheci critérios nessa frase. Use UF, Macro, congregações, status ou tipo de imóvel nos filtros.';
      return;
    }
    $('search').value='';
    $('questionHint').textContent='Interpretado: '+detected.join(' · ');
    $('groupBy').value='';updateFilters(true);
  }
  function analysisMatches(f) {
    const a=f.analysis||{};
    if($('stateFilter').value&&a.uf!==$('stateFilter').value)return false;
    if($('macroFilter').value&&a.macro!==$('macroFilter').value)return false;
    if($('recFilter').value&&a.rec!==$('recFilter').value)return false;
    if($('propertyFilter').value&&f.propertyType!==$('propertyFilter').value)return false;
    if($('caseFilter').value&&a.status!==$('caseFilter').value)return false;
    const count=$('congFilter').value;
    if(count){
      if(count==='unknown'&&a.exact===null&&a.bucket==='')return true;
      if(count==='unknown')return false;
      if(count==='unique'&&a.bucket!=='unique')return false;
      if(count==='5+' && !(a.exact!==null?a.exact>=5:a.bucket==='5+'))return false;
      if(count==='6+' && !(a.exact!==null?a.exact>=6:a.bucket==='5+'))return false;
      if(/^[1-4]$/.test(count)&&!(a.exact!==null?a.exact===Number(count):a.bucket===count))return false;
    }
    return true;
  }
  function groupName(f,key){
    const a=f.analysis||{};
    if(key==='uf')return a.uf||'Não identificado';
    if(key==='macro')return a.macro||'Não identificado';
    if(key==='rec')return a.rec||'Não identificado';
    if(key==='type')return SEMANTIC_TYPES[f.propertyType]||'Não identificado';
    if(key==='cong')return a.exact!==null&&a.exact!==undefined
      ? a.exact+' congregação(ões)' : ({'5+':'5 ou mais','unique':'Única na cidade'}[a.bucket]||a.bucket||'Não identificado');
    if(key==='status')return a.status||'Não identificado';
    return '';
  }
  function updateAnalysisView() {
    const selected=$('congFilter').value;
    const banner=$('analysisResult'),groups=$('groupStats');
    const hasAnalysis=['stateFilter','macroFilter','recFilter','propertyFilter','congFilter','caseFilter']
      .some(id=>!!$(id).value)||!!$('question').value;
    banner.hidden=!hasAnalysis;
    if(hasAnalysis) {
      const count=state.filtered.length;
      const suffix=selected==='6+'?' candidatos': ' locais';
      let summary=count.toLocaleString('pt-BR')+suffix+' encontrados nos filtros atuais.';
      if(selected==='6+'){
        const uncertain=state.filtered.filter(f=>f.analysis.exact===null).length;
        if(uncertain)summary+=' Atenção: '+uncertain.toLocaleString('pt-BR')+
          ' têm apenas a categoria de cor “5 ou mais”; não é possível afirmar que sejam 6+ sem a quantidade exata.';
      }else if(selected==='5+'){
        const onlyColor=state.filtered.filter(f=>f.analysis.exact===null).length;
        if(onlyColor)summary+=' '+onlyColor.toLocaleString('pt-BR')+' classificados pela cor do ícone (5+).';
      }
      banner.textContent=summary;
    }
    groups.replaceChildren();
    const key=$('groupBy').value;
    groups.hidden=!key;
    if(!key)return;
    const counts=new Map();
    for(const f of state.filtered){
      const text=groupName(f,key);
      counts.set(text,(counts.get(text)||0)+1);
    }
    const title=elText('strong','group-title','Agrupamento — '+counts.size+' categorias');
    groups.append(title);
    for(const [name,count] of [...counts].sort((a,b)=>b[1]-a[1]).slice(0,25)){
      const row=elText('div','group-stat','');
      row.append(elText('span','',name),elText('b','',count.toLocaleString('pt-BR')));
      groups.append(row);
    }
  }
  function exportAnalysisCSV() {
    if(!state.filtered.length){showToast('Nenhum resultado para exportar.');return;}
    const heading=['BRA / Nome','Tipo','UF','Macro','REC','Congregações exatas','Categoria por cor','Situação','Latitude','Longitude'];
    const body=[heading,...state.filtered.map(f=>[
      f.name,SEMANTIC_TYPES[f.propertyType]||'',f.analysis.uf,f.analysis.macro,f.analysis.rec,
      f.analysis.exact===null?'':String(f.analysis.exact),f.analysis.bucket,f.analysis.status,
      f.pos[0].toFixed(6),f.pos[1].toFixed(6)
    ])];
    const csv='\uFEFF'+body.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='Mapa_Filtrado_'+Date.now()+'.csv';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function updateFilters(fit = false) {
    state.group=$('groups').value;
    state.search=$('search').value.trim().toLocaleLowerCase('pt-BR');
    state.filtered=state.features.filter(f=>{
      const group=f.path.join(' / ');
      if(state.group&&group!==state.group)return false;
      if(state.iconFilter&&iconKey(f)!==state.iconFilter)return false;
      if(state.typeFilter&&f.propertyType!==state.typeFilter)return false;
      if(!analysisMatches(f))return false;
      if(!state.search)return true;
      const hay=(f.name+' '+group+' '+Object.values(f.metadata).join(' ')+' '+
        (f.analysis?.uf||'')+' '+(f.analysis?.rec||'')).toLocaleLowerCase('pt-BR');
      return hay.includes(state.search);
    });
    $('filteredCount').textContent=state.filtered.length.toLocaleString('pt-BR');
    $('foundCount').textContent=state.filtered.length.toLocaleString('pt-BR');
    renderList();
    renderMap(fit);
    renderLegend();
    updateAnalysisView();
  }
  function install(parsed) {
    resetDetail();
    state.iconFilter = '';state.typeFilter='';
    for (const url of state.iconUrls) URL.revokeObjectURL(url);
    state.iconUrls = parsed.iconUrls || [];
    state.features = parsed.features;
    state.shapes = parsed.shapes;
    state.fileName = parsed.fileName;
    state.profile = mapProfile(parsed.fileName, parsed.features);
    if (state.profile !== 'generic') for (const f of state.features) f.propertyType = identifyProperty(f);
    for(const f of state.features)enrichFeature(f);
    for(const name of ['stateFilter','macroFilter','recFilter','propertyFilter','congFilter','caseFilter','groupBy'])$(name).value='';
    $('question').value='';
    $('questionHint').textContent='Busca local por critérios reconhecidos. Não usa IA nem envia o KML.';
    buildAnalysisOptions();
    showProfile();
    $('fileName').textContent = parsed.fileName;
    $('totalCount').textContent = parsed.features.length.toLocaleString('pt-BR');
    $('currentMapName').textContent = parsed.fileName;
    $('search').value = ''; state.search = ''; state.group = '';
    renderGroups(); updateFilters(true);
    setWorkspace('locais');
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
    return { bytes: result, name: target.name, otherFiles: Object.keys(zip.files).length - 1, zip };
  }
  async function resolveKmzIcons(parsed, zip, kmlName) {
    // Só extrai imagens explicitamente usadas em IconStyle, não fotos anexadas.
    const images = new Map();
    const urls = [];
    const lookup = new Map(Object.keys(zip.files).map(name => [name.toLowerCase(), name]));
    const folder = kmlName.replace(/\\/g, '/').split('/').slice(0, -1);
    const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
    const limitBytes = 2 * 1024 * 1024, totalLimit = 24 * 1024 * 1024;
    let totalBytes = 0;
    function localPath(href) {
      if (!href || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;
      const raw = href.split(/[?#]/)[0].replace(/\\/g, '/');
      let value = raw;
      try { value = decodeURIComponent(raw); } catch (_) { /* nome literal */ }
      const parts = value.startsWith('/') ? [] : [...folder];
      for (const part of value.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
          if (!parts.length) return null;
          parts.pop();
        } else parts.push(part);
      }
      return parts.join('/');
    }
    for (const f of parsed.features) {
      const key = localPath(f.iconHref);
      if (!key) continue;
      const ext = key.split('.').pop().toLowerCase();
      if (!Object.hasOwn(MIME, ext)) continue;
      const actual = lookup.get(key.toLowerCase()) || lookup.get(f.iconHref.toLowerCase());
      if (!actual) continue;
      if (images.has(actual)) {
        f.iconUrl = images.get(actual);
        continue;
      }
      const entry = zip.file(actual);
      if (!entry) continue;
      const declared = entry._data && entry._data.uncompressedSize;
      if (Number.isFinite(declared) && (declared > limitBytes || declared + totalBytes > totalLimit)) continue;
      try {
        const bytes = await entry.async('uint8array');
        if (bytes.length > limitBytes || bytes.length + totalBytes > totalLimit) continue;
        const url = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] }));
        totalBytes += bytes.length;
        images.set(actual, url);
        urls.push(url);
        f.iconUrl = url;
      } catch (e) {
        console.warn('Ícone local KMZ não pôde ser lido:', actual, e);
      }
    }
    parsed.iconUrls = urls;
    // Nenhum URL externo do KML é carregado por este processo.
  }
  async function readKml(file) {
    if (!file) return;
    const isKmz = /\.kmz$/i.test(file.name);
    if (!isKmz && !/\.kml$/i.test(file.name)) {
      $('welcomeError').textContent = 'Selecione um arquivo .kml ou .kmz.';
      $('welcomeError').hidden = false;
      return;
    }
    const maxMB = isKmz ? MAX_KMZ_MB : MAX_KML_MB;
    if (file.size > maxMB * 1024 * 1024) {
      $('welcomeError').textContent='Arquivo maior que ' + maxMB + ' MB. Escolha um arquivo menor.';
      $('welcomeError').hidden=false;
      return;
    }
    const tamanhoMB = (file.size / (1024 * 1024)).toFixed(1);
    const previousName = state.fileName;
    $('loadingName').textContent = file.name;
    $('loadingScreen').hidden = false;
    $('loadingStage').textContent = 'Lendo arquivo · ' + tamanhoMB + ' MB';
    $('welcomeError').hidden = true;
    $('fileName').textContent = 'Abrindo ' + file.name + '…';
    if (file.size > LARGE_KML_MB * 1024 * 1024) {
      showToast('Arquivo grande (' + tamanhoMB + ' MB). Aguarde: a leitura pode usar bastante memória.');
    }
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      let data = await file.arrayBuffer();
      let kmzInfo = null;
      if (isKmz) {
        $('loadingStage').textContent = 'Descompactando conteúdo do KMZ…';
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        const extracted = await extractKmzKml(data);
        data = extracted.bytes;
        kmzInfo = extracted;
      }
      let str = decodeKmlBytes(data);
      data = null; // Permite descartar o buffer antes de materializar a árvore XML.
      $('loadingStage').textContent = 'Interpretando locais e informações…';
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const result = parseKml(str, file.name);
      str = null;
      if (kmzInfo) {
        $('loadingStage').textContent = 'Preparando ícones e referências…';
        await resolveKmzIcons(result, kmzInfo.zip, kmzInfo.name);
        kmzInfo.zip = null;
      }
      $('loadingStage').textContent = 'Montando o mapa…';
      install(result);
      $('welcomeScreen').hidden = true;
      document.body.classList.remove('is-welcome');
      // Atualiza a área do Leaflet depois de revelar a interface.
      requestAnimationFrame(() => map.invalidateSize());
    } catch (err) {
      $('fileName').textContent = previousName || '—';
      const message='Não foi possível abrir o arquivo: ' + (err && err.message ? err.message : String(err));
      $('welcomeError').textContent = message;
      $('welcomeError').hidden = false;
      if(!previousName){$('welcomeScreen').hidden = false;document.body.classList.add('is-welcome');}
      else showToast(message);
      console.error('Falha na importação local do KML/KMZ:', err);
    } finally {
      $('loadingScreen').hidden = true;
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
  $('legendToggle').addEventListener('click', () => {
    const expanded = $('legendToggle').getAttribute('aria-expanded') === 'true';
    $('legendToggle').setAttribute('aria-expanded', String(!expanded));
    $('legendEntries').hidden = expanded;
    $('legendFooter').hidden = expanded;
  });
  $('legendClear').addEventListener('click', () => { state.iconFilter = ''; state.typeFilter='';$('propertyFilter').value='';updateFilters(false); });
  for(const button of document.querySelectorAll('.workspace-tab'))button.addEventListener('click',()=>setWorkspace(button.dataset.workspace));
  for(const key of ['stateFilter','macroFilter','recFilter','propertyFilter','congFilter','caseFilter']) {
    $(key).addEventListener('change',()=>updateFilters(true));
  }
  $('groupBy').addEventListener('change',updateAnalysisView);
  $('askButton').addEventListener('click',()=>interpretQuestion($('question').value));
  $('question').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();interpretQuestion($('question').value);}
  });
  $('clearAdvanced').addEventListener('click',clearAnalysis);
  $('exportFiltered').addEventListener('click',exportAnalysisCSV);
  $('upload').addEventListener('change', e => { readKml(e.target.files[0]); e.target.value = ''; });
  $('openButton').addEventListener('click', () => $('upload').click());

  $('closeDetail').addEventListener('click', resetDetail);
  $('fitButton').addEventListener('click', () => {
    if (state.filtered.length) map.fitBounds(L.latLngBounds(state.filtered.map(f => f.pos)).pad(.1), { maxZoom: 12 });
  });
  const ONLINE_STYLES={
    liberty:'https://tiles.openfreemap.org/styles/liberty',
    positron:'https://tiles.openfreemap.org/styles/positron',
    bright:'https://tiles.openfreemap.org/styles/bright',
    dark:'https://tiles.openfreemap.org/styles/dark'
  };
  const styleLayers=new Map();
  let currentBaseLayer=null;
  let esriNoticeAccepted=false;
  function getMapLayer(mode) {
    if(mode==='liberty')return raster;
    if(styleLayers.has(mode))return styleLayers.get(mode);
    let layer;
    if(mode==='satellite'){
      layer=L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
        maxZoom:19,attribution:'Imagem © Esri e seus fornecedores · World Imagery',
        updateWhenIdle:true,keepBuffer:2
      });
      layer.on('tileerror',()=>{if(currentBaseLayer===layer)showToast('O serviço de imagens da Esri pode exigir autorização ou bloquear este acesso.');});
    }else if(typeof L.maplibreGL==='function'&&ONLINE_STYLES[mode]){
      layer=L.maplibreGL({style:ONLINE_STYLES[mode]});
      layer.on('add',()=>{
        const gl=layer.getMaplibreMap?.();
        if(gl&&!gl._viewerListener){
          gl._viewerListener=true;
          gl.on('error',e=>{
            if(currentBaseLayer===layer){
              console.warn('Falha no estilo de mapa online:',e.error||e);
              showToast('Falha ao carregar o estilo '+mode+'. Verifique o acesso ao provedor.');
            }
          });
        }
      });
    }else{
      showToast('Outros estilos exigem a versão OpenFreeMap. Usando o mapa de ruas.');
      $('mapStyle').value='liberty';
      return raster;
    }
    styleLayers.set(mode,layer);
    return layer;
  }
  function applyBaseMap() {
    if(currentBaseLayer&&map.hasLayer(currentBaseLayer))map.removeLayer(currentBaseLayer);
    currentBaseLayer=null;
    state.osm=$('osmToggle').checked;
    if(state.osm){
      const mode=$('mapStyle').value;
      currentBaseLayer=getMapLayer(mode);
      currentBaseLayer.addTo(map);
      $('statusTitle').textContent=mode==='satellite'?'Satélite · Esri World Imagery': 'OpenFreeMap · '+mode;
    }else{
      $('statusTitle').textContent='Brasil · mapa vetorial local';
    }
    updateStateLabels();
  }
  $('osmToggle').addEventListener('change',()=>{
    if($('osmToggle').checked&&$('mapStyle').value==='satellite'&&!esriNoticeAccepted){
      if(!window.confirm('O modo satélite acessa imagens da Esri. O provedor recebe a área visualizada e o nível de zoom. O uso institucional depende das condições de licença. Deseja testar?')){
        $('osmToggle').checked=false;return;
      }
      esriNoticeAccepted=true;
    }
    applyBaseMap();
  });
  $('mapStyle').addEventListener('change',()=>{
    if($('mapStyle').value==='satellite'&&!esriNoticeAccepted){
      if(!window.confirm('O modo satélite usa o serviço Esri World Imagery, sujeito a licença e autorização institucional. Apenas pedidos de imagens cartográficas são enviados; o KML permanece no navegador. Deseja testar?')){
        $('mapStyle').value='liberty';return;
      }
      esriNoticeAccepted=true;
    }
    if(!$('osmToggle').checked) $('osmToggle').checked=true;
    applyBaseMap();
  });
  function toggleSidebar(show) {
    document.body.classList.toggle('sidebar-collapsed',!show);
    $('showSidebar').checked=show;
    $('sidebarToggle').textContent=show?'Ocultar painel':'Mostrar painel';
    $('sidebarToggle').setAttribute('aria-expanded',String(show));
    requestAnimationFrame(()=>map.invalidateSize());
  }
  $('sidebarToggle').addEventListener('click',()=>toggleSidebar(document.body.classList.contains('sidebar-collapsed')));
  $('showSidebar').addEventListener('change',()=>toggleSidebar($('showSidebar').checked));
  $('showLegend').addEventListener('change',()=>{
    $('mapLegend').hidden=!$('showLegend').checked;
  });
  $('showMapStatus').addEventListener('change',()=>{
    document.querySelector('.map-status').hidden=!$('showMapStatus').checked;
  });
  for(const id of ['showMetrics','showEmptyFields']){
    $(id).addEventListener('change',updateDetailPreferences);
  }
  $('search').addEventListener('input', () => {
    clearTimeout(filterTimer); filterTimer = setTimeout(() => updateFilters(false), 180);
  });
  $('groups').addEventListener('change', () => updateFilters(true));
  const welcomeDrop=$('welcomeDrop');
  welcomeDrop.addEventListener('click',()=> $('upload').click());
  ['dragenter','dragover'].forEach(type=>welcomeDrop.addEventListener(type,e=>{
    e.preventDefault();welcomeDrop.classList.add('dragging');
  }));
  ['dragleave','drop'].forEach(type=>welcomeDrop.addEventListener(type,e=>{
    e.preventDefault();welcomeDrop.classList.remove('dragging');
  }));
  welcomeDrop.addEventListener('drop',e=>readKml(e.dataTransfer.files[0]));
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
  $('statusTitle').textContent = 'Brasil · mapa vetorial local';
  loadDemo();
})();
