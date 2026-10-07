// Offline, read-only project audit. Generates reports; never deletes files or contacts MongoDB.
import ts from 'typescript';
import { BSON } from 'bson';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, basename } from 'node:path';

const root = process.cwd();
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const files = git('ls-files').split(/\r?\n/).filter(file => existsSync(file));
const sourceFiles = files.filter(file => /\.(tsx?|m?js|css|json|md)$/.test(file) && file !== 'package-lock.json');
const texts = new Map(sourceFiles.map(file => [file, readFileSync(file, 'utf8')]));
const edges = new Map();
const incoming = new Map();
for (const [file, text] of texts) {
  const imports = ts.preProcessFile(text, true, true).importedFiles;
  const resolved = [];
  for (const { fileName } of imports) {
    const target = fileName.startsWith('@/') ? resolve('src', fileName.slice(2)) :
      fileName.startsWith('.') ? resolve(dirname(file), fileName) : null;
    if (!target) continue;
    const match = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'].map(ext => relative(root, target + ext).replaceAll('\\', '/')).find(path => files.includes(path));
    if (match) {
      resolved.push(match);
      incoming.set(match, [...(incoming.get(match) || []), file]);
    }
  }
  edges.set(file, resolved);
}
// Every App Router file is protected, including conventions with no imports.
const roots = files.filter(file => file.startsWith('src/app/') || file.startsWith('scripts/') || !file.includes('/') || /(?:middleware|proxy)\.ts$/.test(file));
const reachable = new Set();
function visit(file) { if (reachable.has(file)) return; reachable.add(file); for (const child of edges.get(file) || []) visit(child); }
roots.forEach(visit);
const backup = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Pass the verified BSON backup directory for offline public-asset reference checks');
const manifest = JSON.parse(readFileSync(resolve(backup, 'manifest.json'), 'utf8'));
if (!manifest.verifiedAt) throw new Error('Backup was not verified');
const dbStrings = [];
const walk = value => {
  if (typeof value === 'string') dbStrings.push(value);
  else if (Array.isArray(value)) value.forEach(walk);
  else if (value && typeof value === 'object' && !value._bsontype) Object.values(value).forEach(walk);
};
for (const name of Object.keys(manifest.collections)) {
  const buffer = readFileSync(resolve(backup, manifest.dumpDirectory, manifest.source.database, name + '.bson'));
  let count = 0;
  for (let offset = 0; offset < buffer.length;) {
    const length = buffer.readInt32LE(offset);
    if (length < 5 || offset + length > buffer.length) throw new Error('Invalid BSON length');
    walk(BSON.deserialize(buffer.subarray(offset, offset + length)));
    offset += length;
    count++;
  }
  if (count !== manifest.collections[name].count) throw new Error('Backup count mismatch');
}
const obsoleteShots = /^artifacts\/banner-diagnostics\/local-(fixed(?:-stable)?|ratio-check)-\d+\.png$/;
const rows = files.map(file => {
  const references = [...new Set(incoming.get(file) || [])];
  const directTextReferences = [...texts].filter(([other, text]) => other !== file && !other.startsWith('scripts/audit-') && (text.includes(file) || (file.startsWith('artifacts/') && other.startsWith(dirname(file).replaceAll('\\', '/') + '/') && text.includes(basename(file))))).map(([other]) => other);
  let classification = 'KEEP', reason = 'Active project configuration, runtime dependency, or protected operational file.', risk = 'Required or protected', action = 'Keep';
  if (file.startsWith('src/app/')) reason = 'App Router route, layout, metadata, API endpoint or active stylesheet; protected by convention.';
  else if (file.startsWith('src/components/') && !reachable.has(file)) {
    classification = 'SAFE TO DELETE'; reason = 'Unreachable from all App Router, middleware, configuration and script roots; static/dynamic import and re-export graph checked. No runtime component discovery exists.';
    risk = 'Low; unused private component'; action = 'Delete only after backing up current work and checking unchanged Git content';
  } else if (file.startsWith('public/')) {
    const url = '/' + file.slice(7);
    const codeRefs = [...texts].filter(([, text]) => text.includes(url) || text.includes(basename(file))).map(([other]) => other);
    references.push(...codeRefs);
    const databaseMatches = dbStrings.filter(value => value.includes(url)).length;
    if (databaseMatches) references.push(`Verified BSON backup: ${databaseMatches} string references`);
    reason = 'Public asset; may be loaded by URL or database field. Logos and existing artwork are protected.';
    if (/^public\/(file|globe|window)\.svg$/.test(file) && !references.length) {
      classification = 'SAFE TO DELETE'; reason = 'Unmodified Next starter decoration; zero source/config/script or verified database string references.';
      risk = 'Low; unused starter decoration'; action = 'Delete after Git restore check';
    }
  } else if (file.startsWith('artifacts/')) {
    references.push(...directTextReferences);
    classification = 'REVIEW REQUIRED'; reason = 'Historical screenshot, smoke result or performance evidence; no runtime use, but retention value requires review.';
    risk = 'Evidence/history loss'; action = 'Keep pending approval';
    if (obsoleteShots.test(file) && !references.length) {
      classification = 'SAFE TO DELETE'; reason = 'Unreferenced intermediate banner screenshot superseded by local-final screenshots; not served or imported.';
      risk = 'Low; final and before evidence retained'; action = 'Delete after Git restore check';
    } else if (/\.(md)$/.test(file) || directTextReferences.some(ref => ref.endsWith('.md')) || file.startsWith('artifacts/admin-redesign/')) {
      classification = 'KEEP'; reason = 'Verification report, linked evidence or latest admin redesign verification.'; action = 'Keep';
    }
  } else if (file.startsWith('scripts/')) {
    references.push(...directTextReferences);
    reason = 'Manually invoked operational or verification script; lack of imports does not imply unused.';
    if (['scripts/inspect-db.mjs', 'scripts/verify-admin-ui.mjs'].includes(file)) {
      classification = 'REVIEW REQUIRED'; risk = 'Manual workflow may rely on this script'; action = 'Keep pending approval';
      reason = file.includes('verify-admin-ui') ? 'Older smoke script overlaps verify-admin-redesign.mjs but is an independent manual entrypoint.' : 'Manual database inspection utility with no package.json command; usage cannot be inferred.';
    }
  }
  return { path: file, bytes: statSync(file).size, classification, reason, references: [...new Set(references)], risk, action };
});
const report = {
  createdAt: new Date().toISOString(), restoreCommit: git('rev-parse', 'HEAD'),
  scope: 'Tracked project files; excludes dependencies, build output, Git objects and private backups. Database strings scanned offline; no production calls.',
  protectedIgnoredPaths: ['.env.local', '.next/', 'node_modules/', '.vercel/', '.local-backups/ (all BSON backups, restore tools and work backups)', 'artifacts/performance/package-audit-* (current task evidence)'],
  trackedBytesBefore: rows.reduce((sum, row) => sum + row.bytes, 0),
  safeBytes: rows.filter(row => row.classification === 'SAFE TO DELETE').reduce((sum, row) => sum + row.bytes, 0),
  rows,
};
mkdirSync('artifacts/unused-file-audit', { recursive: true });
writeFileSync('artifacts/unused-file-audit/report.json', JSON.stringify(report, null, 2));
const lines = ['# Unused File Report', '', `Audit: ${report.createdAt}`, '', `Git restore commit: \`${report.restoreCommit}\``, '', report.scope, '', 'This report was generated before deletion. No database changes are authorized by file cleanup.', '', `Tracked project size before: ${report.trackedBytesBefore} bytes. Proposed safe removal: ${report.safeBytes} bytes.`, '', 'Protected ignored paths: ' + report.protectedIgnoredPaths.map(path => '`' + path + '`').join(', '), ''];
for (const group of ['SAFE TO DELETE', 'REVIEW REQUIRED', 'KEEP']) {
  lines.push('## ' + group, '', '| File | Why / references found | Risk | Proposed action |', '| --- | --- | --- | --- |');
  for (const row of rows.filter(row => row.classification === group)) lines.push(`| \`${row.path}\` | ${row.reason} References: ${row.references.join(', ') || 'None found; convention/manual use considered'}. | ${row.risk} | ${row.action} |`);
  lines.push('');
}
lines.push('## Rollback', '', 'Restore only the deleted paths listed in the cleanup log from the commit above using `git restore --source=<commit> --worktree -- <path>`. Do not reset the working tree. Current dirty work is separately copied into the ignored project-cleanup backup before removal.', '');
writeFileSync('artifacts/unused-file-audit/REPORT.md', lines.join('\n'));
console.log(JSON.stringify({ trackedFiles: rows.length, trackedBytesBefore: report.trackedBytesBefore, safeBytes: report.safeBytes, counts: Object.fromEntries(['SAFE TO DELETE', 'REVIEW REQUIRED', 'KEEP'].map(group => [group, rows.filter(row => row.classification === group).length])), safe: rows.filter(row => row.classification === 'SAFE TO DELETE').map(row => row.path) }, null, 2));
