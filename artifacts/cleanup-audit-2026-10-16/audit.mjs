// Audit only: inventories and writes reports. No deletion, process execution beyond
// read-only Git queries, database access, application startup, or network calls.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname, basename, posix } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const output = 'artifacts/cleanup-audit-2026-10-16';
const oldBuild = '.local-backups/production-performance-20261005/normal-build/';
const safeName = value => value.replaceAll('\\', '/');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const initialGitStatus = git('status', '--short');
const tracked = new Set(git('ls-files', '-z').split('\0').filter(Boolean));
const dirty = new Set(git('diff', '--name-only', '-z').split('\0').filter(Boolean));
const staged = new Set(git('diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean));
const inventory = [], links = [], unreadable = [];
function walk(directory) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); }
  catch (error) { unreadable.push({ path: safeName(relative(root, directory)), error: error.code }); return; }
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    const path = safeName(relative(root, absolute));
    if (path === output || path.startsWith(output + '/')) continue;
    try {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) { links.push(path); continue; }
      if (stat.isDirectory()) walk(absolute);
      else if (stat.isFile()) inventory.push({ path, bytes: stat.size, modifiedAt: stat.mtime.toISOString() });
    } catch (error) { unreadable.push({ path, error: error.code }); }
  }
}
walk(root);
inventory.sort((a, b) => a.path.localeCompare(b.path));
console.log(`Inventoried ${inventory.length} regular files; symlinks were not followed.`);

const files = new Set(inventory.map(row => row.path));
const textExtension = /\.(?:tsx?|mts|cts|[cm]?js|css|scss|json|jsonl|md|txt|ya?ml|html|svg|log|config|gitignore|gitattributes|vercelignore)$/i;
const infrastructure = path => /^(?:node_modules|\.git|\.next|\.npm-cache)(?:\/|$)/.test(path);
const texts = new Map();
for (const row of inventory) {
  if (infrastructure(row.path) || row.path.startsWith(oldBuild) || row.path.startsWith('.vercel/') ||
    /(?:^|\/)\.env(?:\.|$)/.test(row.path) || row.path === 'package-lock.json') continue;
  if ((textExtension.test(row.path) || !row.path.includes('/')) && row.bytes < 16 * 1024 * 1024) {
    try { texts.set(row.path, readFileSync(row.path, 'utf8').replace(/^\uFEFF/, '')); }
    catch (error) { unreadable.push({ path: row.path, error: error.code }); }
  }
}
const productionFile = path => path.startsWith('src/') || (!path.includes('/') && !path.endsWith('.md')) || path.startsWith('.github/');
const archivedFile = path => path.startsWith('.local-backups/') || path.startsWith('artifacts/');
function findReferences(path, allowBasename = false) {
  const result = [];
  const publicUrl = path.startsWith('public/') ? '/' + path.slice(7) : null;
  for (const [source, raw] of texts) {
    if (source === path) continue;
    const text = raw.replaceAll('\\\\', '/').replaceAll('\\', '/');
    const local = posix.relative(posix.dirname(source), path);
    const needles = [[path, 'repository path'], [local.startsWith('.') ? local : './' + local, 'relative path']];
    if (publicUrl) needles.push([publicUrl, 'public URL']);
    if (allowBasename) needles.push([basename(path), 'filename-only mention (may be another directory)']);
    for (const [needle, match] of needles) {
      const offset = text.indexOf(needle);
      if (offset < 0) continue;
      result.push({ source, line: text.slice(0, offset).split('\n').length, match,
        scope: archivedFile(source) ? 'historical evidence' : productionFile(source) ? 'production/config' : 'manual tool/documentation' });
      break;
    }
  }
  return result;
}
const sourceFiles = inventory.filter(row => row.path.startsWith('src/') && /\.(tsx?|mts|[cm]?js|css)$/.test(row.path));
const edges = new Map(), incoming = new Map(), unresolvedLocalImports = [];
function resolveLocal(specifier, source) {
  const base = specifier.startsWith('@/') ? 'src/' + specifier.slice(2) :
    specifier.startsWith('.') ? safeName(relative(root, resolve(dirname(source), specifier))) : null;
  if (!base) return null;
  return ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.css', '/index.ts', '/index.tsx', '/index.js']
    .map(suffix => base + suffix).find(candidate => files.has(candidate)) || null;
}
const codeFiles = [...texts.keys()].filter(path => /\.(tsx?|mts|[cm]?js)$/.test(path) && !archivedFile(path));
for (const source of codeFiles) {
  const parsed = ts.createSourceFile(source, texts.get(source), ts.ScriptTarget.Latest, true,
    source.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = new Set();
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(parsed) === 'require') &&
      node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) imports.add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const children = [];
  for (const specifier of imports) {
    const target = resolveLocal(specifier, source);
    if (target) {
      children.push(target);
      incoming.set(target, [...(incoming.get(target) || []), source]);
    } else if (specifier.startsWith('@/') || specifier.startsWith('.')) unresolvedLocalImports.push({ source, specifier });
  }
  edges.set(source, children);
}
const roots = sourceFiles.filter(row => row.path.startsWith('src/app/') || /(?:^|\/)(?:proxy|middleware|instrumentation|instrumentation-client)\.[^.]+$/.test(row.path)).map(row => row.path);
const reachable = new Set();
function visit(path) { if (reachable.has(path)) return; reachable.add(path); (edges.get(path) || []).forEach(visit); }
roots.forEach(visit);
const sourceOrphans = sourceFiles.filter(row => !reachable.has(row.path) && !row.path.startsWith('src/app/')).map(row => row.path);
console.log(`Checked static imports, re-exports, and literal dynamic imports in ${codeFiles.length} working code files.`);

const inputFiles = new Map([
  ['artifacts/mobile-responsive/baseline.json', { source: 'scripts/verify-mobile-responsive.mjs', line: 124, match: 'readFile input via output/baseline.json', scope: 'retained verification dependency' }],
  ['artifacts/performance/production-20261005-before-browser.json', { source: 'scripts/performance/image-audit.mjs', line: 5, match: 'readFile input', scope: 'retained verification dependency' }],
]);
const operationalScripts = new Set([
  'scripts/manage-admin.mjs', 'scripts/init-admin.mjs', 'scripts/migrate-images-to-blob.mjs',
  'scripts/backup-package-audit.mjs', 'scripts/audit-package-backup.mjs', 'scripts/verify-package-restore-dryrun.mjs',
  'scripts/performance/regressions.test.mjs', 'scripts/verify-admin-ui.mjs', 'scripts/verify-runtime.mjs', 'scripts/verify-payments.mjs',
]);
const backupBuildRefs = findReferences(oldBuild.slice(0, -1));
const workingBackupBuildRefs = backupBuildRefs.filter(ref => ref.scope !== 'historical evidence');
const rows = [];
for (const file of inventory) {
  const path = file.path;
  if (/^(?:node_modules|\.git|\.next|\.npm-cache)\//.test(path)) continue;
  const generatedBuild = path.startsWith(oldBuild);
  const refs = generatedBuild ? backupBuildRefs : findReferences(path, /^(?:public|scripts|scratch)\//.test(path));
  for (const source of incoming.get(path) || []) if (!refs.some(ref => ref.source === source)) refs.push({ source, match: 'resolved import/re-export', scope: productionFile(source) ? 'production/config' : 'manual tool/documentation' });
  let classification = 'KEEP', reason = 'Project configuration or a production dependency.', risk = 'High if removed', action = 'Preserve.';
  const codeRefs = refs.filter(ref => ref.scope === 'production/config');
  if (generatedBuild) {
    classification = workingBackupBuildRefs.length ? 'REVIEW REQUIRED' : 'SAFE TO DELETE';
    reason = 'Archived Next.js build output only: compiled bundles, optimizer/cache files, traces and generated types; not the current .next build. Original source snapshots live outside this directory.';
    risk = 'Low production risk; exact historical compiled build is lost.';
    action = 'Delete only the explicitly listed normal-build directory after approval; keep sibling source snapshots.';
  } else if (path.startsWith('artifacts/')) {
    classification = codeRefs.length ? 'REVIEW REQUIRED' : 'SAFE TO DELETE';
    reason = 'Historical screenshot, visual audit, benchmark/profile, diagnostic output or generated report. No production import, public URL use or build/CI input found.';
    risk = 'Low production risk; historical visual/performance evidence is lost.';
    action = 'Delete after approval; manual producer scripts can regenerate new output.';
    if (inputFiles.has(path)) {
      classification = 'KEEP'; reason = 'An existing verification script reads this JSON as input, rather than merely writing it as output.';
      risk = 'Deleting it breaks the retained verification script.'; action = 'Keep unless its consumer is separately retired or updated.'; refs.unshift(inputFiles.get(path));
    } else if (['artifacts/unused-file-audit/work-backup.json', 'artifacts/unused-file-audit/cleanup-log.json'].includes(path)) {
      classification = 'REVIEW REQUIRED'; reason = 'Prior cleanup work backup or rollback provenance; not an ordinary disposable screenshot/report.';
      risk = 'May be needed to restore previous dirty work or explain prior deletions.'; action = 'Review restore coverage and retain until a separate archive/retention decision.';
    } else if (/\.[cm]?js$/.test(path)) {
      classification = 'REVIEW REQUIRED'; reason = 'Executable browser verification tool stored inside artifacts. Lack of production use does not establish that its manual workflow is retired.';
      risk = 'Loss of a manual verification workflow.'; action = 'Review separately; remove surrounding generated output only.';
    }
  } else if (path.startsWith('.local-backups/')) {
    classification = 'REVIEW REQUIRED'; reason = 'Historical source/work snapshot or restoration utility; may contain the only copy of uncommitted work.';
    risk = 'Loss of rollback coverage; Git may not restore this version.'; action = 'Keep pending a separate backup-retention decision.';
    if (path.includes('/package-audit-') || path.startsWith('.local-backups/package-audit-')) {
      classification = 'KEEP'; reason = 'Verified database dump, manifest, collection metadata or restoration evidence. Production data backups are protected.';
      risk = 'Loss of database recovery data.'; action = 'Preserve the complete verified backup sets.';
    } else if (path.startsWith('.local-backups/tools/')) {
      classification = 'KEEP'; reason = 'MongoDB restoration tools and their distribution/license files. verify-package-restore-dryrun.mjs explicitly depends on the extracted mongorestore path.';
      risk = 'Breaks the existing restore-verification workflow if removed as a folder.'; action = 'Preserve; optional installer-only pruning requires a separate decision.';
    }
  } else if (path.startsWith('scratch/')) {
    classification = codeRefs.length || (incoming.get(path) || []).length ? 'REVIEW REQUIRED' : 'SAFE TO DELETE';
    reason = 'One-off headless-browser DOM/animation/layout diagnostics; not a Next.js convention entry, package script, workflow, runtime import or documented verification command.';
    risk = 'Low production risk; old ad-hoc debugging commands are lost.'; action = 'Delete after approval; preserve a copy of modified files before removal if rollback of current work is required.';
  } else if (path.startsWith('scripts/')) {
    classification = operationalScripts.has(path) ? 'KEEP' : 'REVIEW REQUIRED';
    reason = operationalScripts.has(path) ? 'Operational/admin/backup tooling, package.json test entry or current verification workflow.' : 'Manually executable audit, benchmark or diagnostic script; no package command is not proof it is unused.';
    risk = operationalScripts.has(path) ? 'Breaks setup, backup, regression or current verification workflows.' : 'Could retire an intentional manual workflow; some scripts have database/supplier side effects.';
    action = operationalScripts.has(path) ? 'Preserve.' : 'Review manual usage and overlapping coverage before retiring; do not run as part of this audit.';
  } else if (path.startsWith('postman/')) {
    reason = 'Reusable local payment simulation linked from README.md and used by scripts/verify-payments.mjs; fixtures do not imply disposable data.';
    action = 'Keep the simulation and its mock files together.';
  } else if (path.startsWith('public/')) {
    reason = 'Public assets can be requested directly or selected through MongoDB settings, banners and game/package metadata; source-only absence is insufficient.';
    if (!codeRefs.length) {
      classification = 'REVIEW REQUIRED'; risk = 'Could be referenced by database content or external URLs/bookmarks.'; action = 'Keep pending a current read-only database/URL-usage check; no production calls made in this audit.';
      if (/public\/(next|vercel)\.svg$/.test(path)) reason = 'Unreferenced Next.js starter artwork in source/config; still a public URL, so kept outside the initial deletion scope.';
    } else { reason = 'Active logo, payment image, fallback image or public artwork referenced by production source.'; action = 'Preserve.'; }
  } else if (path.startsWith('src/')) {
    reason = path.startsWith('src/app/') ? 'Protected App Router page/layout/loading/error/route, stylesheet or metadata file; framework conventions are roots even without imports.' : 'Reachable from protected App Router or proxy roots through static imports, re-exports or literal dynamic imports.';
    if (sourceOrphans.includes(path)) {
      classification = 'REVIEW REQUIRED'; reason = 'No production import path found, but this is a protected storefront compatibility module, not disposable generated output.';
      risk = 'Compatibility name or external/manual usage may exist.'; action = 'Review separately; do not delete in this pass.';
    }
  } else if (path === 'tsconfig.tsbuildinfo') {
    classification = 'SAFE TO DELETE'; reason = 'Regenerable TypeScript incremental compiler cache, enabled by tsconfig.json; not source code or runtime input.';
    risk = 'Low: next typecheck/build may take longer.'; action = 'Delete after approval; TypeScript recreates it.';
  } else if (/^\.env(?:\.|$)/.test(path) || path.startsWith('.vercel/')) {
    reason = 'Protected local environment or Vercel linkage/deployment configuration. Contents intentionally not included in the report.';
    action = 'Preserve; do not expose secrets.';
  }
  const gitState = staged.has(path) ? 'staged' : dirty.has(path) ? 'modified' : tracked.has(path) ? 'tracked clean' : 'untracked or ignored';
  rows.push({ ...file, classification, references: refs, reason, risk, action, gitState });
}
for (const [path, classification, reason, risk, action] of [
  ['node_modules/', 'KEEP', 'Installed locked dependencies needed for the application, compiler, framework and tools.', 'Application/build stops until dependencies are restored.', 'Preserve; dependency pruning is outside this cleanup.'],
  ['.git/', 'KEEP', 'Repository history, index and worktree metadata; needed for rollback.', 'Loss of repository integrity or recovery.', 'Preserve.'],
  ['.next/', 'REVIEW REQUIRED', 'Current Next.js production/dev output and caches. npm start and generated type imports use this directory.', 'Stopping the current app or removing generated types until a rebuild.', 'Keep in the initial scope; discuss a controlled clean rebuild separately.'],
  ['.npm-cache/', 'SAFE TO DELETE', 'Local npm download cache, logs and update-notifier output; no runtime/package script consumes this folder.', 'Low: future installation may download data again.', 'Delete after approval, with no npm install running.'],
]) {
  const children = inventory.filter(row => row.path.startsWith(path));
  if (!children.length) continue;
  rows.push({ path, bytes: children.reduce((sum, row) => sum + row.bytes, 0), files: children.length, classification,
    references: findReferences(path.slice(0, -1)), reason, risk, action, gitState: 'managed/generated directory' });
}
const safeRows = rows.filter(row => row.classification === 'SAFE TO DELETE');
const groupScopes = [oldBuild, '.npm-cache/', 'scratch/', ...[...new Set(inventory.filter(row => row.path.startsWith('artifacts/')).map(row => row.path.split('/').slice(0, 2).join('/') + '/'))]];
const targets = [];
const covered = new Set();
for (const path of groupScopes) {
  const children = rows.filter(row => row.path === path || row.path.startsWith(path));
  if (!children.length || children.some(row => row.classification !== 'SAFE TO DELETE')) continue;
  targets.push({ path, kind: 'directory', bytes: children.reduce((sum, row) => sum + row.bytes, 0), files: children.reduce((sum, row) => sum + (row.files || 1), 0), references: findReferences(path.replace(/\/$/, '')) });
  children.forEach(row => covered.add(row.path));
}
for (const row of safeRows.filter(row => !covered.has(row.path))) targets.push({ path: row.path, kind: 'file', bytes: row.bytes, files: 1, references: row.references });
const safeFiles = inventory.filter(file => safeRows.some(row => row.path.endsWith('/') ? file.path.startsWith(row.path) : file.path === row.path));
console.log(`Classified ${safeFiles.length} safe candidate files; preparing approval manifest and exact-size report.`);
const safeManifest = safeFiles.map(file => ({ ...file, sha256: createHash('sha256').update(readFileSync(file.path)).digest('hex'),
  gitState: rows.find(row => row.path === file.path)?.gitState || 'generated directory member' }));

const hashGroups = new Map();
for (const row of inventory.filter(row => /^(src|public|scripts|scratch)\//.test(row.path))) {
  const hash = createHash('sha256').update(readFileSync(row.path)).digest('hex');
  hashGroups.set(hash, [...(hashGroups.get(hash) || []), row.path]);
}
const duplicates = [...hashGroups.values()].filter(group => group.length > 1);
const totals = Object.fromEntries(['SAFE TO DELETE', 'REVIEW REQUIRED', 'KEEP'].map(group => {
  const selected = rows.filter(row => row.classification === group);
  return [group, { bytes: selected.reduce((sum, row) => sum + row.bytes, 0), files: selected.reduce((sum, row) => sum + (row.files || 1), 0) }];
}));
const rootSizes = [...new Set(inventory.map(row => row.path.split('/')[0]))].map(path => {
  const children = inventory.filter(row => row.path === path || row.path.startsWith(path + '/'));
  return { path, files: children.length, bytes: children.reduce((sum, row) => sum + row.bytes, 0) };
}).sort((a, b) => b.bytes - a.bytes);
const report = { createdAt: new Date().toISOString(), status: 'AWAITING USER APPROVAL; NOTHING DELETED', root,
  commit: git('rev-parse', 'HEAD').trim(), projectBytesBefore: inventory.reduce((sum, row) => sum + row.bytes, 0), projectFilesBefore: inventory.length,
  measurement: 'Logical sizes of regular files in the complete workspace, including ignored dependencies, current build, Git objects and backups. Symlinks not followed. Current audit output excluded to avoid self-counting; no disk-allocation or cloud-storage estimate.',
  methods: ['Complete filesystem metadata inventory, including ignored and untracked files.', 'AST import/re-export/literal dynamic import graph; every App Router source file is protected as a convention root.', 'Repository-path, relative-path, public-URL and filename mentions searched in human-authored working files, archived source snapshots and text reports; references record source/line without secret values.', 'Dependencies, Git internals, compiler output and archived compiled builds inventoried as generated groups, not treated as authoritative source references; environments/Vercel contents not searched or exposed.', 'Read package.json, tsconfig, Tailwind/PostCSS/shadcn config, ESLint config, Next config, Vercel ignores/config and repository instructions.', 'No .github directory or GitHub workflow files exist in this checkout.', 'No database, supplier, payment, Blob, deployment, live API or browser test actions were executed.'],
  totals, targets, safeFiles: safeManifest, roots, sourceOrphans, unresolvedLocalImports, exactDuplicateWorkingFiles: duplicates,
  rootSizes, skippedSymlinks: links, unreadable, initialGitStatus, rows };
const fmt = bytes => `${bytes.toLocaleString('en-US')} B (${(bytes / 1024 / 1024).toFixed(2)} MiB)`;
const refsText = refs => refs.length ? refs.map(ref => `${ref.source}${ref.line ? ':' + ref.line : ''} [${ref.scope}; ${ref.match}]`).join('; ') : 'No references found in the searched project source/config/tools/docs and archived-source text; framework/manual entry points considered.';
const escape = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = ['# SakSuuu cleanup audit — approval required', '', `Created: ${report.createdAt}`, '', '**Nothing has been deleted, moved, rebuilt, synced, deployed or changed in MongoDB.**', '',
  `Repository: \`${root}\``, '', `Git rollback reference: \`${report.commit}\``, '', `Project size before cleanup: **${fmt(report.projectBytesBefore)}** (${report.projectFilesBefore.toLocaleString('en-US')} regular files).`, '',
  'No cleanup has run. Before/after cleanup size is unchanged, excluding the newly written audit files. Sizes below are logical file bytes, not allocated filesystem space.', '',
  '| Classification | Files | Size |', '| --- | ---: | ---: |', ...Object.entries(totals).map(([group, total]) => `| ${group} | ${total.files} | ${fmt(total.bytes)} |`), '',
  '## Scope and safeguards', '', ...report.methods.map(method => '- ' + method), '',
  '- Protected: all environment files, package/lock/TypeScript/Next/Tailwind configuration, proxy and routes, models, authentication, supplier/payment/webhook/Blob services, active UI components and public assets.',
  '- `.vercel/`, `.git/`, `node_modules/`, current `.next/`, database dumps and source/work backups are not in the deletion proposal.',
  '- The archived `normal-build/` under `.local-backups/production-performance-20261005/` is generated output only. Its sibling source/config snapshots are separately retained.',
  '- Current audit artifacts are kept for approval and recovery. The existing older unused-file audit was reviewed but was not reused as an authoritative decision.', '',
  '## Exact proposed deletion targets', '', '**This list requires explicit approval. No wildcard deletion is proposed.** Full per-file size, reference findings, reason, risk and action appear below and in `manifest.json`; SHA-256 checksums for every proposed file are in `proposed-deletions.json`.', '',
  '| Exact path | Type | Files | Size |', '| --- | --- | ---: | ---: |', ...targets.map(target => `| \`${target.path}\` | ${target.kind} | ${target.files} | ${fmt(target.bytes)} |`), '',
  '### Important exceptions inside artifact folders', '',
  '- KEEP `artifacts/mobile-responsive/baseline.json`: read at `scripts/verify-mobile-responsive.mjs:124`.',
  '- KEEP `artifacts/performance/production-20261005-before-browser.json`: read at `scripts/performance/image-audit.mjs:5`.',
  '- REVIEW `artifacts/falling-flowers/verify.mjs`: executable verification script, not image output.',
  '- REVIEW `artifacts/unused-file-audit/work-backup.json` and `cleanup-log.json`: prior work/rollback evidence.',
  '- Consequently those mixed folders must not be removed wholesale; only the exact safe files listed are proposed.', '',
  '## Retained tests and overlapping manual tools', '',
  '- KEEP `scripts/performance/regressions.test.mjs`: explicitly invoked by `npm test`; the `.test` suffix does not make it unused.',
  '- KEEP `scripts/verify-admin-ui.mjs`, `scripts/verify-runtime.mjs`, `scripts/verify-payments.mjs` and the `postman/` payment fixtures: current verification workflows.',
  '- KEEP the App Router MLBB test page and API routes under `src/app/`; Next.js loads them by convention.',
  '- REVIEW `scripts/verify-admin-redesign.mjs`: overlaps the retained admin UI audit, but is a distinct manual entry point, not a byte-identical duplicate.',
  '- REVIEW legacy scripts under `scripts/performance/` (except the kept regression suite) and older banner/mobile/UI audits; retire only after their intended manual coverage is confirmed.',
  '- SAFE `scratch/`: nine standalone, one-off browser diagnostics. No package command, production import, CI workflow or retained script calls these files.', '',
  '## Duplicate/dead-code findings', '',
  `Current source files without a protected production import path: ${sourceOrphans.length ? sourceOrphans.map(path => '`' + path + '`').join(', ') : 'none'}.`,
  '- `RomdulFlowers.tsx` is a small compatibility re-export of the active `FallingFlowersBackground`, not a duplicated dashboard implementation. It is REVIEW REQUIRED, excluded from safe deletion.',
  '- Old dashboard/storefront variants inside `.local-backups` are rollback snapshots; they are excluded from TypeScript/ESLint/deployment by existing configuration and retained for review.',
  `- Byte-identical current source/public/script files: ${duplicates.length ? JSON.stringify(duplicates) : 'none found'}.`,
  `- Unresolved literal local imports: ${unresolvedLocalImports.length}. ${unresolvedLocalImports.length ? 'See manifest.json for details; no affected source is approved for deletion.' : 'No missing local import targets found.'}`, '',
  '## Verification stage', '', 'TypeScript, production build and browser smoke tests are deferred until an approved deletion is performed. This audit ran no existing operational scripts because some can modify data or contact providers.', '',
  'After approval: delete only approved SAFE items; run `npx tsc --noEmit` and `npm run build`; check homepage, game page/package selection, admin/login, banners, orders/payments and suppliers. Use synthetic or read-only checks; no real payment/order creation.', '',
  '## Rollback and dirty-work warning', '', 'The initial Git status is dirty. A Git restore returns committed content only; it does not recover current modified or untracked versions. Before any approved deletion, retain an approved rollback copy of changed/untracked candidates needed for recovery. Do not use git reset, git clean, or a recursive project-wide delete. Restore only the exact deleted paths. Revalidate checksums and resolved workspace boundaries before removal.', '',
  '## Initial Git status', '', '```text', initialGitStatus.trimEnd(), '```', '',
  '## Repository size breakdown', '', '| Path | Files | Size |', '| --- | ---: | ---: |', ...rootSizes.map(row => `| \`${row.path}\` | ${row.files} | ${fmt(row.bytes)} |`), '',
  '## Full file/folder classification', '', 'Generated dependency/Git/current-build/cache internals are grouped; all individual paths and sizes remain in `inventory.json`. All other files, including every archived-build deletion candidate, are listed individually here.', ''];
for (const group of ['SAFE TO DELETE', 'REVIEW REQUIRED', 'KEEP']) {
  lines.push('### ' + group, '', '| Exact path | Size | References found | Reason | Deletion risk | Recommended action | Git state |', '| --- | ---: | --- | --- | --- | --- | --- |');
  for (const row of rows.filter(row => row.classification === group)) lines.push(`| \`${row.path}\` | ${fmt(row.bytes)} | ${escape(refsText(row.references))} | ${escape(row.reason)} | ${escape(row.risk)} | ${escape(row.action)} | ${row.gitState} |`);
  lines.push('');
}
lines.push('## Inventory limitations', '', `Symlinks not followed: ${links.map(path => '`' + path + '`').join(', ') || 'none'}.`, '', `Unreadable entries: ${unreadable.length}.`, '', 'Public images can be referenced by current database content or external URLs; no live database was queried. No public asset is proposed for deletion. No inference is made from a `.test`, `.spec`, PNG or JSON extension alone.', '', '**STOP: wait for user approval of the exact SAFE list before removal.**', '');
mkdirSync(output, { recursive: true });
writeFileSync(output + '/REPORT.md', lines.join('\n'));
writeFileSync(output + '/manifest.json', JSON.stringify(report, null, 2));
writeFileSync(output + '/proposed-deletions.json', JSON.stringify({ status: report.status, createdAt: report.createdAt, root,
  approved: false, bytes: totals['SAFE TO DELETE'].bytes, targets, files: safeManifest }, null, 2));
writeFileSync(output + '/inventory.json', JSON.stringify({ createdAt: report.createdAt, measurement: report.measurement, files: inventory, symlinks: links, unreadable }, null, 2));
console.log(JSON.stringify({ report: output + '/REPORT.md', projectBytesBefore: report.projectBytesBefore, projectFilesBefore: inventory.length,
  totals, proposedTargets: targets.length, sourceOrphans, unresolvedLocalImports, exactDuplicates: duplicates, unreadable, safeDirectories: targets.filter(target => target.kind === 'directory') }, null, 2));
