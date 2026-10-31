export interface CronLogEntry {
  tag: "CRON_PAYMENTS" | "CRON_SUPPLIER" | "CRON_TELEGRAM" | "CRON_ALL" | "CRON_AUTH";
  event: "start" | "progress" | "success" | "transient_error" | "permanent_error" | "busy" | "summary";
  orderNumber?: string;
  transactionId?: string;
  supplier?: string;
  error?: string;
  durationMs?: number;
  stats?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export function logCronEvent(entry: CronLogEntry): void {
  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  const line = `[CRON][${entry.tag}] ${JSON.stringify(payload)}`;
  if (entry.event === "permanent_error") {
    console.error(line);
  } else if (entry.event === "transient_error" || entry.event === "busy") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

