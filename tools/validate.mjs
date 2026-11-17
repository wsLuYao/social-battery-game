import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/runtime/manifest.js'), 'utf8'), context);
const manifest = context.window.GAME_RESOURCE_MANIFEST;
const resources = manifest.resources;
const release = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
if (!/^v\d+$/.test(release.version) || release.build !== `${release.release_date?.replaceAll('-', '')}-${release.version}` || release.build !== manifest.version) errors.push('Release version and resource manifest disagree');
const known = new Set([...Object.keys(manifest.aliases || {}), ...Object.values(resources).map(r => r.url)]);
const exists = name => fs.existsSync(path.join(root, name));
for (const [id, resource] of Object.entries(resources)) {
  const absolute = path.resolve(root, resource.url);
  if (!absolute.startsWith(root + path.sep)) errors.push(`Resource outside repository: ${id}`);
  else if (!fs.existsSync(absolute)) errors.push(`Missing resource: ${resource.url}`);
  else if (fs.statSync(absolute).size !== resource.bytes) errors.push(`Wrong byte count: ${resource.url}`);
  for (const dependency of resource.deps || []) {
    if (!resources[dependency]) errors.push(`Missing dependency: ${id} -> ${dependency}`);
  }
}
for (const [group, spec] of Object.entries(manifest.groups)) {
  for (const id of [...spec.required, ...(spec.optional || [])]) {
    if (!resources[id]) errors.push(`Missing group resource: ${group} -> ${id}`);
  }
}
for (const [alias, id] of Object.entries(manifest.aliases || {})) {
  if (!resources[id]) errors.push(`Broken alias: ${alias}`);
}
let canonical;
for (const name of ['index.html', 'game.html']) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  if (!html.includes(`name="application-version" content="${release.version}"`)) errors.push(`Missing release version: ${name}`);
  if (!html.includes(`manifest.js?v=${release.build}`)) errors.push(`Wrong manifest cache version: ${name}`);
  for (const match of html.matchAll(/\b(?:src|href|data-game-src)="([^"]+)"/g)) {
    const target = match[1].split(/[?#]/)[0];
    if (/^(?:https?:|data:|mailto:)/.test(target) || !target) continue;
    if (target.startsWith('/') || (!exists(target) && !known.has(target))) errors.push(`Broken entry reference: ${name} -> ${target}`);
  }
  const url = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  if (!url?.startsWith('https://')) errors.push(`Missing public canonical URL: ${name}`);
  if (canonical && canonical !== url) errors.push('Entry-point canonical URLs differ');
  canonical = url;
}
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(filename);
    else files.push(filename);
  }
}
walk(root);
const resourcePaths = new Set(Object.values(resources).map(resource => resource.url));
for (const filename of files) {
  const relative = path.relative(root, filename).split(path.sep).join('/');
  if (relative.startsWith('assets/runtime/') && !resourcePaths.has(relative)) errors.push(`Unreferenced release asset: ${relative}`);
  if (relative.startsWith('src/runtime/') && /^core-|^game-/.test(path.basename(filename)) && !resourcePaths.has(relative)) errors.push(`Obsolete runtime: ${relative}`);
  if (/(?:^|\/)部署说明_v\d+\.md$|(?:^|\/)_(?:receipt_)?preview/.test(relative)) errors.push(`Obsolete or temporary release file: ${relative}`);
}
for (const filename of files.filter(f => /\.(?:js|mjs)$/.test(f))) {
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`JavaScript syntax: ${path.relative(root, filename)}\n${result.stderr}`);
}
const core = Object.values(resources).find(r => /\/core-[\da-f]+\.js$/.test(r.url));
if (!core) errors.push('Missing core runtime');
else {
  const text = fs.readFileSync(path.join(root, core.url), 'utf8');
  const match = text.match(/const SHARE_GAME_QR = (\{.*?\});/);
  if (!match) errors.push('Missing receipt QR data');
  else {
    const qr = JSON.parse(match[1]);
    if (qr.url !== canonical) errors.push('Receipt QR URL differs from deployed URL');
    if (qr.rows.length !== 37 || qr.rows.some(row => !/^[01]{37}$/.test(row))) errors.push('Invalid receipt QR matrix dimensions');
  }
}
for (const filename of ['README.md', 'README.en.md']) {
  const text = fs.readFileSync(path.join(root, filename), 'utf8');
  for (const match of text.matchAll(/(?:src="|\]\()((?:docs\/)[^"\s)]+)(?:"|\))/g)) {
    if (!exists(match[1])) errors.push(`Missing README asset: ${match[1]}`);
  }
}
if (!exists('.nojekyll')) errors.push('Missing GitHub Pages static marker');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Passed ${release.version}: ${Object.keys(resources).length} resources, ${Object.keys(manifest.groups).length} groups, release versions, no obsolete assets, entry references, JavaScript syntax, README screenshots, and receipt QR destination.`);
