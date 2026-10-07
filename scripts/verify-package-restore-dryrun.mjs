// MongoDB's own restore parser, in dry-run mode only. Never imports documents.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is missing");
if (!process.argv[2]) throw new Error("Pass a verified backup directory");
const backup = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(backup, "manifest.json"), "utf8"));
const configuredDatabase = process.env.MONGODB_DB_NAME || "test";
if (!manifest.verifiedAt || manifest.source.database !== configuredDatabase ||
    manifest.source.host !== new URL(uri).host)
  throw new Error("Backup does not match the configured database");

const tool = resolve(process.cwd(), ".local-backups/tools/mongodb-database-tools-windows-x86_64-100.19.1/bin/mongorestore.exe");
const config = join(tmpdir(), `saksuuu-mongorestore-${randomBytes(8).toString("hex")}.yml`);
await writeFile(config, `uri: ${JSON.stringify(uri)}\n`);
try {
  const output = await new Promise((resolveOutput, reject) => {
    const child = spawn(tool, ["--config", config, "--dryRun", "--verbose", join(backup, manifest.dumpDirectory)], { windowsHide: true });
    let text = "";
    child.stdout.on("data", chunk => { text += chunk; });
    child.stderr.on("data", chunk => { text += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolveOutput(text) : reject(new Error(`mongorestore dry run exited ${code}: ${text.replaceAll(uri, "[redacted]")}`)));
  });
  const safeOutput = output.replaceAll(uri, "[redacted]");
  await writeFile(join(backup, "mongorestore-dryrun.log"), safeOutput);
  for (const name of Object.keys(manifest.collections)) {
    if (!safeOutput.includes(`found collection \`${configuredDatabase}.${name}\` bson`) ||
        !safeOutput.includes(`found collection metadata from \`${configuredDatabase}.${name}\``) ||
        safeOutput.includes("don't know what to do with file"))
      throw new Error(`mongorestore did not recognize ${name} as a restorable collection`);
  }
  console.log(safeOutput);
} finally {
  await unlink(config).catch(() => {});
}
