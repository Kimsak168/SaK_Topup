// Offline, read-only dry-run audit of a verified BSON backup.
// All proposed changes are suggestions only; this script never writes to Atlas.
import { BSON } from "bson";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const backup = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Pass a verified backup directory");
const manifest = JSON.parse(await readFile(join(backup, "manifest.json"), "utf8"));
if (!manifest.verifiedAt || manifest.source.database !== "test")
  throw new Error("Expected the verified SakSuuu backup for database test");

async function load(name) {
  const data = await readFile(join(backup, manifest.dumpDirectory, manifest.source.database, `${name}.bson`));
  const docs = [];
  for (let offset = 0; offset < data.length;) {
    const length = data.readInt32LE(offset);
    docs.push(BSON.deserialize(data.subarray(offset, offset + length)));
    offset += length;
  }
  if (docs.length !== manifest.collections[name].count) throw new Error(`Backup count mismatch: ${name}`);
  return docs;
}

const [games, packages, banners, orders] = await Promise.all([
  load("games"), load("gamepackages"), load("banners"), load("orders"),
]);
const validSuppliers = new Set(["vizo", "g2bulk"]);
const issues = [];
const proposedUpdates = new Map();
const proposedMergeDeletes = [];
const str = (value) => typeof value === "string" ? value.trim() : "";
const key = (...values) => values.map(value => str(value)).join("\u001f");
const oid = (value) => String(value?._id ?? value ?? "");
const gameLabel = (game) => game ? `${str(game.name)} (${str(game.supplier)}/${str(game.supplierGameCode)})` : "Unresolved game";
const issue = (doc, collection, game, kind, action, reason) => {
  issues.push({
    collection, recordId: oid(doc), game: gameLabel(game),
    packageName: collection === "gamepackages" ? str(doc.name) : "—",
    supplier: str(doc.supplier) || "—", isActive: doc.isActive ?? null,
    hasValidCustomImage: doc.customImage ? imageProblem(doc.customImage) === null : false,
    issue: kind, proposedAction: action, reason,
  });
};
const bySlug = new Map();
const byCode = new Map();
for (const game of games) {
  for (const [map, value] of [[bySlug, game.slug], [byCode, game.supplierGameCode]]) {
    const id = key(game.supplier, value);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(game);
  }
}

function resolveGame(pkg) {
  const matches = new Map();
  for (const value of [pkg.gameSlug, pkg.gameCode]) {
    for (const map of [bySlug, byCode]) {
      for (const game of map.get(key(pkg.supplier, value)) || []) matches.set(oid(game), game);
    }
  }
  return [...matches.values()];
}

function imageProblem(value) {
  if (typeof value !== "string" || !value.trim()) return "empty or non-string image reference";
  if (value !== value.trim() || /[\u0000-\u001f]/.test(value)) return "malformed whitespace/control character in image reference";
  if (value.startsWith("/") && !value.startsWith("//")) {
    const pathname = value.split(/[?#]/, 1)[0];
    if (pathname.startsWith("/api/")) return null;
    if (pathname.includes("..")) return "unsafe local image path";
    if (!existsSync(join(process.cwd(), "public", pathname.slice(1)))) return "missing local image file";
    return null;
  }
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return "unsupported image URL scheme";
    if (url.hostname === "api.g2bulk.com" && url.pathname === "/images/test.png")
      return "known G2Bulk test image URL";
    return null;
  } catch {
    return "malformed image URL";
  }
}

function checkImage(doc, collection, game, field, required = false) {
  if (doc[field] == null || doc[field] === "") {
    if (required) issue(doc, collection, game, `${field}: missing image`, "Manual review", "Required schema image has no valid value; no safe replacement can be inferred.");
    return;
  }
  const problem = imageProblem(doc[field]);
  if (!problem) return;
  const canUnset = problem === "known G2Bulk test image URL" && (
    (collection === "gamepackages" && field === "customImage" && !doc.imageData) ||
    (collection === "games" && field === "banner")
  );
  const action = canUnset ? `Unset ${field} after approval; retain other image fields` : "Manual review; preserve any valid Blob or stored image";
  issue(doc, collection, game, `${field}: ${problem}`, action,
    canUnset ? "The URL is a known test asset and no stored image is present." : "The referenced image needs manual confirmation before changing data.");
  if (canUnset) proposedUpdates.set(`${collection}:${oid(doc)}:${field}`, { collection, recordId: oid(doc), field, operation: "unset", expectedValue: doc[field] });
}

function checkPrice(pkg, game, field) {
  const value = pkg[field];
  if (value == null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10000 || (field === "sellingPrice" && value === 0)) {
    issue(pkg, "gamepackages", game, `${field}: invalid or implausible value`, "Manual review; no price invented",
      `Raw ${field} must be a finite, plausible nonnegative USD value${field === "sellingPrice" ? " and greater than zero when set" : ""}.`);
  }
}

const orderRefs = new Map();
for (const order of orders) {
  if (!order.packageId) continue;
  const id = String(order.packageId);
  orderRefs.set(id, (orderRefs.get(id) || 0) + 1);
}
const packageGame = new Map();
for (const game of games) {
  const fields = ["slug", "name", "supplier", "supplierGameCode", "image"];
  for (const field of fields) {
    if (!str(game[field])) issue(game, "games", game, `${field}: missing required field`, "Manual review", "Required Game schema field is absent or blank.");
  }
  if (!validSuppliers.has(game.supplier)) issue(game, "games", game, "invalid supplier", "Manual review", "Supplier is outside the Game schema enum.");
  if (game.type != null && !["direct", "voucher"].includes(game.type))
    issue(game, "games", game, "invalid game type", "Manual review", "Value is outside the Game schema enum.");
  for (const field of ["isActive", "isPopular", "isTrending", "requiresServer"]) {
    if (game[field] != null && typeof game[field] !== "boolean")
      issue(game, "games", game, `${field}: invalid boolean`, "Manual review", "Game schema expects a boolean.");
  }
  for (const field of ["category", "publisher", "currencyName", "description", "serverLabel", "userIdLabel", "instruction", "badge"]) {
    if (game[field] != null && typeof game[field] !== "string")
      issue(game, "games", game, `${field}: invalid string`, "Manual review", "Game schema expects a string.");
  }
  for (const field of ["image", "customImage", "banner"]) checkImage(game, "games", game, field, field === "image");
  for (const field of ["sortOrder", "defaultMarginPercent"]) {
    if (game[field] != null && (typeof game[field] !== "number" || !Number.isFinite(game[field])))
      issue(game, "games", game, `${field}: invalid number`, "Manual review", "Game schema expects a finite number.");
  }
}

for (const pkg of packages) {
  const matches = resolveGame(pkg);
  const game = matches.length === 1 ? matches[0] : undefined;
  packageGame.set(oid(pkg), game);
  if (!matches.length) issue(pkg, "gamepackages", game, "orphan package", "Manual review; keep record", "No Game with matching supplier and game slug/code exists in this backup.");
  if (matches.length > 1) issue(pkg, "gamepackages", game, "conflicting game references", "Manual review; keep record", "Package slug and code resolve to different Games.");
  for (const field of ["gameSlug", "supplierProductCode", "name", "supplier"]) {
    if (!str(pkg[field])) issue(pkg, "gamepackages", game, `${field}: missing required field`, "Manual review", "Required GamePackage schema field is absent or blank.");
  }
  if (!validSuppliers.has(pkg.supplier)) issue(pkg, "gamepackages", game, "invalid supplier", "Manual review", "Supplier is outside the GamePackage schema enum.");
  if (pkg.packageType != null && !["direct", "voucher"].includes(pkg.packageType))
    issue(pkg, "gamepackages", game, "invalid package type", "Manual review", "Value is outside the GamePackage schema enum.");
  for (const field of ["isActive", "isFeatured", "adminConfigured"]) {
    if (pkg[field] != null && typeof pkg[field] !== "boolean")
      issue(pkg, "gamepackages", game, `${field}: invalid boolean`, "Manual review", "GamePackage schema expects a boolean.");
  }
  for (const field of ["gameCode", "diamondsOrPoints", "bonus", "currency", "badge"]) {
    if (pkg[field] != null && typeof pkg[field] !== "string")
      issue(pkg, "gamepackages", game, `${field}: invalid string`, "Manual review", "GamePackage schema expects a string.");
  }
  for (const field of ["createdAt", "updatedAt", "syncedAt"]) {
    if (pkg[field] != null && (!(pkg[field] instanceof Date) || !Number.isFinite(pkg[field].getTime())))
      issue(pkg, "gamepackages", game, `${field}: invalid date`, "Manual review", "GamePackage schema expects a valid date.");
  }
  if (/^(undefined|null|nan|test|n\/a)$/i.test(str(pkg.name)) || /[\u0000-\u001f]/.test(str(pkg.name)))
    issue(pkg, "gamepackages", game, "malformed package name", "Manual review", "Name contains a placeholder or control character.");
  if (typeof pkg.name === "string" && pkg.name !== pkg.name.trim())
    issue(pkg, "gamepackages", game, "untrimmed package name", "Trim after approval", "Whitespace differs from current trim-enabled schema.");
  for (const field of ["buyingPrice", "sellingPrice", "originalPrice"]) checkPrice(pkg, game, field);
  if (pkg.sortOrder != null && (typeof pkg.sortOrder !== "number" || !Number.isFinite(pkg.sortOrder)))
    issue(pkg, "gamepackages", game, "invalid sort order", "Manual review", "Sort order must be numeric.");
  checkImage(pkg, "gamepackages", game, "customImage");
}

for (const banner of banners) checkImage(banner, "banners", undefined, "imageUrl", true);

function duplicateGroups(items, groupKey) {
  const groups = new Map();
  for (const item of items) {
    const k = groupKey(item);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  }
  return [...groups.values()].filter(group => group.length > 1);
}

const duplicateGames = duplicateGroups(games, g => key(g.supplier, g.supplierGameCode));
for (const group of duplicateGames) for (const game of group)
  issue(game, "games", game, "duplicate supplier/game code", "Manual review; keep all", `Same supplier/code as IDs ${group.map(oid).join(", ")}.`);

const duplicateSlugs = duplicateGroups(games, g => str(g.slug));
for (const group of duplicateSlugs) for (const game of group)
  issue(game, "games", game, "duplicate game slug", "Manual review; keep all", `Same slug as IDs ${group.map(oid).join(", ")}.`);

const packageIdentity = (p) => {
  const game = packageGame.get(oid(p));
  return game && str(p.supplierProductCode) ? key(oid(game), p.supplier, p.supplierProductCode) : null;
};
const duplicatePackages = duplicateGroups(packages, packageIdentity);
for (const group of duplicatePackages) {
  const matchingPayload = new Set(group.map(p => JSON.stringify({
    name: p.name, denomination: p.diamondsOrPoints, bonus: p.bonus,
    packageType: p.packageType, buyingPrice: p.buyingPrice, sellingPrice: p.sellingPrice,
    originalPrice: p.originalPrice, customImage: p.customImage, isActive: p.isActive,
    isFeatured: p.isFeatured, adminConfigured: p.adminConfigured, badge: p.badge,
  }))).size === 1;
  for (const pkg of group) {
    const refs = orderRefs.get(oid(pkg)) || 0;
    issue(pkg, "gamepackages", packageGame.get(oid(pkg)),
      matchingPayload ? "exact duplicate package identity and values" : "duplicate supplier package ID under one game",
      "Manual merge review; do not delete automatically",
      `Shared supplier package ID with ${group.map(oid).join(", ")}; ${refs} direct order reference(s). Preserve admin overrides and regional variants.`);
  }
}

const staleCandidates = duplicateGroups(packages, p => {
  const game = packageGame.get(oid(p));
  return game && str(p.name) ? key(oid(game), p.supplier, p.name.toLowerCase(), p.diamondsOrPoints, p.bonus, p.packageType, p.currency) : null;
}).filter(group => new Set(group.map(p => str(p.supplierProductCode))).size > 1 &&
  group.some(p => p.isActive === false && Date.now() - new Date(p.syncedAt || p.updatedAt || 0).getTime() > 30 * 86400000) &&
  group.some(p => p.isActive !== false));
for (const group of staleCandidates) for (const pkg of group)
  issue(pkg, "gamepackages", packageGame.get(oid(pkg)), "possible superseded supplier record",
    "Manual review; keep all", "Same game, denomination, name, bonus, type, and currency with differing supplier IDs; one inactive/old and another active. Regional variants must be checked.");

const issueTypes = {};
for (const entry of issues) issueTypes[entry.issue] = (issueTypes[entry.issue] || 0) + 1;
const remoteImages = new Set([
  ...games.flatMap(game => [game.image, game.customImage, game.banner]),
  ...packages.map(pkg => pkg.customImage),
  ...banners.map(banner => banner.imageUrl),
].filter(value => typeof value === "string" && /^https?:\/\//i.test(value)));
const remoteImageHosts = {};
for (const value of remoteImages) {
  try {
    const host = new URL(value).hostname;
    remoteImageHosts[host] = (remoteImageHosts[host] || 0) + 1;
  } catch {}
}
const summary = {
  source: manifest.source, backup: backup, backupVerifiedAt: manifest.verifiedAt,
  totalGames: games.length, totalPackages: packages.length, totalBanners: banners.length,
  duplicatePackageGroups: duplicatePackages.length,
  duplicatePackageExcessRecords: duplicatePackages.reduce((sum, group) => sum + group.length - 1, 0),
  duplicateGameGroups: duplicateGames.length, duplicateSlugGroups: duplicateSlugs.length,
  corruptedPackageRecords: new Set(issues.filter(i => i.collection === "gamepackages" && /invalid|malformed|missing required|untrimmed/.test(i.issue)).map(i => i.recordId)).size,
  invalidImageRecords: new Set(issues.filter(i => /image/.test(i.issue)).map(i => `${i.collection}:${i.recordId}`)).size,
  orphanPackageRecords: new Set(issues.filter(i => i.issue === "orphan package").map(i => i.recordId)).size,
  possibleStaleGroups: staleCandidates.length,
  remoteImageUrlsNotLiveTested: remoteImages.size, remoteImageHosts,
  issueTypes, proposedUpdateIds: [...new Set([...proposedUpdates.values()].map(change => change.recordId))], proposedMergeDeleteIds: proposedMergeDeletes,
};
const report = { summary, proposedUpdates: [...proposedUpdates.values()], proposedMergeDeletes, issues };
await writeFile(join(backup, "dry-run-report.json"), JSON.stringify(report, null, 2));
await writeFile(join(backup, "dry-run-report.md"), [
  "# SakSuuu package data dry run", "", `Source: ${manifest.source.host}/${manifest.source.database}`,
  `Backup verified: ${manifest.verifiedAt}`, "", "## Summary", "", "```json", JSON.stringify(summary, null, 2), "```", "",
  "## Proposed production updates — approval required", "",
  "| Collection | Record ID | Field | Operation | Current value to match |",
  "| --- | --- | --- | --- | --- |",
  ...[...proposedUpdates.values()].map(change =>
    `| ${change.collection} | ${change.recordId} | ${change.field} | ${change.operation} | ${String(change.expectedValue).replaceAll("|", "\\|")} |`),
  "", "No merges or deletions are proposed. The required Game.image field remains unchanged pending a verified replacement.", "",
  "## Rollback plan", "",
  "Before any approved write, compare the live record to the backed-up value. Apply only the approved field change with an _id and current-value match.",
  "To roll back, restore the exact backed-up field value with an _id and post-change-value match. Keep all other fields untouched.",
  "The BSON dump and index metadata are retained for a separate full restore if ever needed; do not run a full --drop restore for this field-level change.", "",
  "## Record findings", "", "| Collection | Record ID | Game | Package | Supplier | Active | Valid custom image | Issue | Proposed action | Reason |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...issues.map(i => [i.collection, i.recordId, i.game, i.packageName, i.supplier, i.isActive, i.hasValidCustomImage, i.issue, i.proposedAction, i.reason]
    .map(v => String(v).replaceAll("|", "\\|").replaceAll("\n", " ")).join(" | ").replace(/^/, "| ").replace(/$/, " |")), "",
].join("\n"));
console.log(JSON.stringify(summary, null, 2));
