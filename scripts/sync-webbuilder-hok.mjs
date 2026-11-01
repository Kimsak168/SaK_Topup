// Keep the legacy HoK command on the same catalogue path as admin sync.
process.argv.push("--hok");
await import("./sync-webbuilder.mjs");
