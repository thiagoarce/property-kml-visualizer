/* Regressão de coordenadas KML. Apenas dados fictícios; nenhuma dependência externa. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
const start = source.indexOf('  function parseCoordinates(value) {');
const end = source.indexOf('  function xmlColor(', start);
assert.ok(start >= 0 && end > start, 'Função parseCoordinates não encontrada');
const func = source.slice(start, end).trim();
const parseCoordinates = vm.runInNewContext('(' + func + ')');
// Normaliza objetos vindos do contexto VM para Array padrão deste contexto.
const parse = text => JSON.parse(JSON.stringify(parseCoordinates(text)));

assert.deepEqual(parse('-60.0217, -3.1190'), [[-3.119, -60.0217]], 'KML do VBA: espaço depois da vírgula');
assert.deepEqual(parse(' -60.0217 , -3.1190, 0 '), [[-3.119, -60.0217]], 'Espaços antes/depois das vírgulas e altitude');
assert.deepEqual(parse('-34.8600,-7.1200,0'), [[-7.12,-34.86]], 'KML padrão sem espaços');
assert.deepEqual(parse('-35.0,-8.0,0 -36.1, -9.2, 5'), [[-8,-35],[-9.2,-36.1]], 'Linha com múltiplos pontos');
assert.deepEqual(parse('-35.0,\n-8.0,0\n-36.1,\n-9.2,5'), [[-8,-35],[-9.2,-36.1]], 'Quebras de linha ao redor das vírgulas');
assert.deepEqual(parse('-35,,'), [], 'Latitude vazia não vira 0');
assert.deepEqual(parse('-35,'), [], 'Latitude ausente não vira 0');
assert.deepEqual(parse('not-a-number,-3'), [], 'Coordenada inválida rejeitada');
assert.deepEqual(parse('-35,-99'), [], 'Latitude fora do intervalo rejeitada');
console.log('OK: 8 cenários de coordenadas KML incluindo o formato VBA (vírgula + espaço)');
