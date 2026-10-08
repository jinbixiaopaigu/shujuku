// Deterministically compose maintained module definitions into selectable presets.
// Run with --install to add generated presets to SillyTavern settings.
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';

const modulesDir = path.resolve(import.meta.dirname, '../templates/generic-narrative');
const names = ['core', 'arc', 'adventure', 'continuity', 'adult'];
const labels = { arc: '角色弧光', adventure: '冒险世界', continuity: '场景连续性', adult: '成人题材' };
const modules = Object.fromEntries(names.map(name => [name, JSON.parse(fs.readFileSync(path.join(modulesDir, `${name}.json`), 'utf8'))]));
const SQL = await initSqlJs();
for (const [name, sheets] of Object.entries(modules)) {
  for (const [key, sheet] of Object.entries(sheets)) {
    if (key !== sheet.uid || !key.startsWith('sheet_')) throw new Error(`Invalid sheet identity: ${name}/${key}`);
    const db = new SQL.Database();
    db.run(sheet.sourceData.ddl);
    const table = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`]?([\w]+)["`]?/i.exec(sheet.sourceData.ddl)?.[1];
    const columns = db.exec(`PRAGMA table_info(${table})`)[0]?.values || [];
    if (columns.length !== sheet.content[0].length) throw new Error(`Header/DDL mismatch: ${name}/${sheet.name}`);
    if (sheet.content.length !== 1) throw new Error(`Seed rows forbidden: ${name}/${sheet.name}`);
    if (sheet.exportConfig?.enabled !== false || sheet.exportConfig?.delivery !== 'chat_prompt') throw new Error(`Shared worldbook export enabled: ${name}/${sheet.name}`);
    db.close();
  }
}

const out = path.join(modulesDir, 'generated');
fs.mkdirSync(out, { recursive: true });
const presets = {};
for (let mask = 0; mask < 16; mask++) {
  const optional = names.slice(1).filter((_, index) => mask & (1 << index));
  const included = ['core', ...optional];
  const template = {
    mate: {
      type: 'chatSheets', version: 2, updateConfigUiSentinel: -1,
      genericNarrative: { version: 1, delivery: 'chat_prompt', modules: included },
      globalInjectionConfig: {},
    },
  };
  let orderNo = 1;
  for (const module of included) {
    for (const [key, sourceSheet] of Object.entries(modules[module])) {
      if (template[key]) throw new Error(`Duplicate key: ${key}`);
      const sheet = structuredClone(sourceSheet);
      sheet.orderNo = orderNo++;
      template[key] = sheet;
    }
  }
  const title = optional.length ? `通用叙事·核心＋${optional.map(name => labels[name]).join('＋')}` : '通用叙事·核心';
  const file = mask.toString(2).padStart(4, '0') + '.json';
  fs.writeFileSync(path.join(out, file), JSON.stringify(template, null, 2) + '\n');
  presets[title] = { file, modules: included };
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(presets, null, 2) + '\n');
if (process.argv.includes('--install')) {
  const root = path.resolve(import.meta.dirname, '../../../../../../');
  const settingsPath = path.join(root, 'data/default-user/settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const storage = settings.extension_settings?.__userscripts?.shujuku_v120__userscript_settings_v1;
  if (!storage) throw new Error('Missing database plugin settings');
  const key = 'shujuku_v120_templatePresets_v1';
  const store = JSON.parse(storage[key] || '{"version":1,"presets":{}}');
  for (const [title, entry] of Object.entries(presets)) {
    const template = JSON.parse(fs.readFileSync(path.join(out, entry.file), 'utf8'));
    store.presets[title] = { templateStr: JSON.stringify(template), updatedAt: Date.now() };
  }
  storage[key] = JSON.stringify(store);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
console.log(`Validated and generated ${Object.keys(presets).length} generic narrative presets${process.argv.includes('--install') ? '; installed to settings' : ''}.`);
