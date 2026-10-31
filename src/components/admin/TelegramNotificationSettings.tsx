"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  Bot,
  Users,
  Radio,
  RotateCcw,
  Check,
} from "lucide-react";

interface NotificationHistoryItem {
  orderNumber: string;
  eventId: string;
  kind: "PAYMENT" | "ORDER";
  status: "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";
  state: "queued" | "sending" | "retrying" | "sent" | "failed";
  attemptCount: number;
  createdAt: string;
  sentAt?: string;
  telegramMessageId?: string;
  lastError?: string;
}

interface NotificationStats {
  sent: number;
  failed: number;
  retrying: number;
  queued: number;
  total: number;
}

interface ConnectionDetails {
  bot?: {
    username: string;
    firstName: string;
  };
  chat?: {
    title: string;
    type: string;
    isForum?: boolean;
  };
  topics?: {
    pending?: number;
    success?: number;
    failed?: number;
  };
  webhook?: {
    active: boolean;
    url?: string;
  };
}

export function TelegramNotificationSettings() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [chatIdMasked, setChatIdMasked] = useState("");
  const [stats, setStats] = useState<NotificationStats>({
    sent: 0,
    failed: 0,
    retrying: 0,
    queued: 0,
    total: 0,
  });
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [topics, setTopics] = useState<{ pending?: string; success?: string; failed?: string }>({});

  // Action states
  const [testingConnection, setTestingConnection] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load notification settings");

      setConfigured(Boolean(data.configured));
      setChatIdMasked(data.chatIdMasked || "Not configured");
      if (data.topics) setTopics(data.topics);
      if (data.stats) setStats(data.stats);
      if (Array.isArray(data.history)) setHistory(data.history);
    } catch (err) {
      console.error("Failed to load Telegram settings:", err);
      toast.error("Failed to fetch Telegram notification status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleTestConnection = async () => {
    try {
      setTestingConnection(true);
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_connection" }),
      });
      const data = await res.json();

      if (data.success) {
        setConnectionDetails({
          bot: data.bot,
          chat: data.chat,
          webhook: data.webhook,
        });
        toast.success(
          `Connected! Bot @${data.bot?.username || "bot"} verified in "${data.chat?.title || "SakSuu"}"`
        );
      } else {
        toast.error(data.error || "Connection test failed. Check environment variables.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error testing Telegram connection");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSendTestMessage = async () => {
    try {
      setSendingTest(true);
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_test" }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Test notification message delivered to Telegram group!");
        void fetchOverview();
      } else {
        toast.error(data.error || "Failed to send test message");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error sending test message");
    } finally {
      setSendingTest(false);
    }
  };

  const handleRetryAllFailed = async () => {
    try {
      setRetryingAll(true);
      const res = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_all_failed" }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.message || `Requeued failed notifications.`);
        void fetchOverview();
      } else {
        toast.error(data.error || "Failed to requeue failed notifications");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error retrying notifications");
    } finally {
      setRetryingAll(false);
    }
  };

  const handleRetrySingle = async (orderNumber: string, eventId: string) => {
    try {
      setRetryingId(eventId);
      const res = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, eventId }),
      });
      const data = await res.json();

      if (data.success && data.requeued) {
        toast.success(`Notification requeued for order ${orderNumber}`);
        void fetchOverview();
      } else {
        toast.error("Could not requeue event. It may already be processing.");
      }
    } catch {
      toast.error("Network error retrying notification");
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-[#243047] bg-[#111A2B] p-5 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-[#151F31] rounded" />
        <div className="h-20 bg-[#151F31] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#243047] bg-[#111A2B] p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#243047]">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-[rgba(41,169,235,0.15)] text-[#29A9EB] flex items-center justify-center">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#F8FAFC]">
              Telegram Bot Admin Notifications
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Automated 6-status real-time alerts dispatched to your private SakSuu admin group.
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2">
          {configured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[rgba(34,197,94,0.15)] text-[#22C55E] border border-[rgba(34,197,94,0.3)]">
              <span className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
              Configured & Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[rgba(245,158,11,0.15)] text-[#F59E0B] border border-[rgba(245,158,11,0.3)]">
              <AlertTriangle className="h-3 w-3" />
              Missing Environment Variables
            </span>
          )}
        </div>
      </div>

      {/* Connection & Group Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg bg-[#151F31] border border-[#243047] p-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-[#29A9EB]" />
            Target Admin Group
          </p>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#F8FAFC]">
              {connectionDetails?.chat?.title || "SakSuu Private Group"}
            </p>
            <p className="text-xs text-[#94A3B8]">
              Chat ID: <code className="text-[#38BDF8] bg-[#0B132B] px-2 py-0.5 rounded text-[11px]">{chatIdMasked}</code>
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-[#151F31] border border-[#243047] p-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-[#22C55E]" />
            Bot Identity
          </p>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#F8FAFC]">
              {connectionDetails?.bot?.firstName || (configured ? "SakSuu Top-Up Bot" : "Not Connected")}
            </p>
            <p className="text-xs text-[#94A3B8]">
              {connectionDetails?.bot?.username ? (
                <>Username: <span className="text-[#22C55E]">@{connectionDetails.bot.username}</span></>
              ) : (
                "Credentials secured in server environment variables"
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Forum Topics Card */}
      <div className="rounded-lg bg-[#151F31] border border-[#243047] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-[#38BDF8]" />
            Telegram Forum Topics Routing
          </p>
          <span className="text-[11px] text-[#94A3B8]">
            Supergroup Topics (Auto-routed)
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-md bg-[#0B132B] border border-[#243047] p-2.5 space-y-1">
            <div className="text-[11px] font-medium text-[#F59E0B] flex items-center gap-1">
              <span>⁉️</span> Pending Orders
            </div>
            <p className="text-xs text-[#F8FAFC] font-mono">
              Thread ID: {topics.pending ? <span className="text-[#38BDF8]">{topics.pending}</span> : <span className="text-[#64748B]">Default (# General)</span>}
            </p>
          </div>
          <div className="rounded-md bg-[#0B132B] border border-[#243047] p-2.5 space-y-1">
            <div className="text-[11px] font-medium text-[#22C55E] flex items-center gap-1">
              <span>💎</span> Success Orders
            </div>
            <p className="text-xs text-[#F8FAFC] font-mono">
              Thread ID: {topics.success ? <span className="text-[#22C55E]">{topics.success}</span> : <span className="text-[#64748B]">Default (# General)</span>}
            </p>
          </div>
          <div className="rounded-md bg-[#0B132B] border border-[#243047] p-2.5 space-y-1">
            <div className="text-[11px] font-medium text-[#EF4444] flex items-center gap-1">
              <span>💡</span> Failed Orders
            </div>
            <p className="text-xs text-[#F8FAFC] font-mono">
              Thread ID: {topics.failed ? <span className="text-[#EF4444]">{topics.failed}</span> : <span className="text-[#64748B]">Default (# General)</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testingConnection || !configured}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold text-[#F8FAFC] bg-[#151F31] hover:bg-[#1E293B] border border-[#243047] transition-colors cursor-pointer disabled:opacity-50"
        >
          {testingConnection ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#29A9EB]" />
          ) : (
            <Radio className="h-3.5 w-3.5 text-[#29A9EB]" />
          )}
          <span>{testingConnection ? "Verifying..." : "Test Telegram Connection"}</span>
        </button>

        <button
          type="button"
          onClick={handleSendTestMessage}
          disabled={sendingTest || !configured}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold text-[#080D18] bg-[#29A9EB] hover:bg-[#229ED9] transition-colors cursor-pointer disabled:opacity-50"
        >
          {sendingTest ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          <span>{sendingTest ? "Sending..." : "Send Test Message"}</span>
        </button>

        {stats.failed > 0 && (
          <button
            type="button"
            onClick={handleRetryAllFailed}
            disabled={retryingAll}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold text-[#EF4444] bg-[rgba(239,68,68,0.1)] hover:bg-[rgba(239,68,68,0.2)] border border-[rgba(239,68,68,0.3)] transition-colors cursor-pointer disabled:opacity-50 ml-auto"
          >
            {retryingAll ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            <span>Retry Failed ({stats.failed})</span>
          </button>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        <div className="p-3 rounded-lg bg-[#151F31] border border-[#243047]">
          <p className="text-[11px] text-[#94A3B8]">Delivered</p>
          <p className="text-lg font-black text-[#22C55E] flex items-center gap-1.5 mt-0.5">
            <CheckCircle2 className="h-4 w-4" />
            {stats.sent}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-[#151F31] border border-[#243047]">
          <p className="text-[11px] text-[#94A3B8]">Failed</p>
          <p className="text-lg font-black text-[#EF4444] flex items-center gap-1.5 mt-0.5">
            <XCircle className="h-4 w-4" />
            {stats.failed}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-[#151F31] border border-[#243047]">
          <p className="text-[11px] text-[#94A3B8]">In Queue / Retrying</p>
          <p className="text-lg font-black text-[#F59E0B] flex items-center gap-1.5 mt-0.5">
            <Clock className="h-4 w-4" />
            {stats.queued + stats.retrying}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-[#151F31] border border-[#243047]">
          <p className="text-[11px] text-[#94A3B8]">Total Events</p>
          <p className="text-lg font-black text-[#F8FAFC] flex items-center gap-1.5 mt-0.5">
            <Check className="h-4 w-4 text-[#38BDF8]" />
            {stats.total}
          </p>
        </div>
      </div>

      {/* Notification History Table */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
            Recent Notification History ({history.length})
          </h3>
          <button
            type="button"
            onClick={() => void fetchOverview()}
            className="text-[11px] text-[#29A9EB] hover:underline flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>

        {history.length === 0 ? (
          <div className="p-6 rounded-lg bg-[#151F31] border border-[#243047] text-center text-xs text-[#94A3B8]">
            No notification events recorded yet. When orders or payments transition status, events are durably recorded here.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#243047]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B132B] text-[#94A3B8] font-semibold border-b border-[#243047]">
                <tr>
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Notification Event</th>
                  <th className="py-2.5 px-3">Delivery Status</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#243047] bg-[#111A2B]">
                {history.map((item) => {
                  const isSuccess = item.state === "sent";
                  const isFailed = item.state === "failed";
                  const isPending = item.state === "queued" || item.state === "retrying" || item.state === "sending";

                  return (
                    <tr key={item.eventId} className="hover:bg-[#151F31] transition-colors">
                      <td className="py-2.5 px-3 font-mono text-[#38BDF8]">
                        {item.orderNumber}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 font-semibold text-[#F8FAFC]">
                          {item.status === "SUCCESS" && "🟢"}
                          {item.status === "PENDING" && "🟡"}
                          {item.status === "FAILED" && "🔴"}
                          {item.kind} {item.status}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        {isSuccess && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[rgba(34,197,94,0.15)] text-[#22C55E]">
                            Sent (ID: {item.telegramMessageId || "OK"})
                          </span>
                        )}
                        {isFailed && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[rgba(239,68,68,0.15)] text-[#EF4444]"
                            title={item.lastError || "Failed"}
                          >
                            Failed: {item.lastError ? item.lastError.slice(0, 30) : "Rejected"}
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[rgba(245,158,11,0.15)] text-[#F59E0B]">
                            {item.state} (attempt {item.attemptCount})
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-[#94A3B8] text-[11px]">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        {isFailed && (
                          <button
                            type="button"
                            onClick={() => handleRetrySingle(item.orderNumber, item.eventId)}
                            disabled={retryingId === item.eventId}
                            className="text-[11px] font-bold text-[#29A9EB] hover:underline disabled:opacity-50 cursor-pointer"
                          >
                            {retryingId === item.eventId ? "Requeuing..." : "Retry"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

