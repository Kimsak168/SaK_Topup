import "server-only";

import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { SupplierBalanceSnapshot } from "@/models/SupplierBalanceSnapshot";
import { Refund } from "@/models/Refund";
import { formatMinorUnits, toMinorUnits } from "@/lib/financeMath.mjs";

const PAYMENT_SUCCESS = ["successful", "SUCCESSFUL", "paid", "PAID"] as const;
const ORDER_PAID = ["paid", "PAID"] as const;
const ORDER_REFUNDED = ["refunded", "REFUNDED"] as const;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export interface FinanceRange { from: Date; to: Date; }
type Money = bigint;
interface CurrencyTotals {
  currency: string;
  verifiedPayments: Money;
  grossOrderSales: Money;
  recordedRefunds: Money;
  supplierCostEstimate: Money;
  orderCount: number;
  ordersWithKnownCost: number;
  ordersWithUnknownCost: number;
  ordersWithVerifiedPayment: number;
  unmatchedPayments: number;
  pendingPayments: Money;
  pendingPaymentCount: number;
  failedPayments: Money;
  failedPaymentCount: number;
  pendingSupplierOrders: number;
  completedOrders: number;
  refundRecordCount: number;
  legacyRefundedOrdersWithoutRecord: number;
}

function validDate(value: string | null, end = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value) ? date : null;
}

export function parseFinanceRange(params: URLSearchParams, now = new Date()): FinanceRange {
  const requestedTo = validDate(params.get("to"), true);
  const to = requestedTo || now;
  const requestedFrom = validDate(params.get("from"));
  const from = requestedFrom || new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (from > to || to.getTime() - from.getTime() > MAX_RANGE_MS) throw new Error("Choose a date range of 366 days or less.");
  return { from, to };
}

function dateRange(range: FinanceRange) { return { $gte: range.from, $lte: range.to }; }

function paymentDateFilter(range: FinanceRange) {
  return { $or: [
    { paidAt: dateRange(range) },
    { paidAt: null, createdAt: dateRange(range) },
  ] };
}

function orderDateFilter(range: FinanceRange): any {
  return { $or: [
    { paymentStatus: { $in: ORDER_PAID }, $or: [{ paidAt: dateRange(range) }, { paidAt: null, createdAt: dateRange(range) }] },
    { paymentStatus: { $in: ORDER_REFUNDED }, updatedAt: dateRange(range) },
  ] };
}

function normalizedCurrency(value: unknown): string {
  const currency = String(value || "USD").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

function sameAmount(left: unknown, right: unknown, currency: string): boolean {
  const a = toMinorUnits(typeof left === "number" || typeof left === "string" ? left : "", currency);
  const b = toMinorUnits(typeof right === "number" || typeof right === "string" ? right : "", currency);
  return a !== null && b !== null && a === b;
}

function newTotals(currency: string): CurrencyTotals {
  return { currency, verifiedPayments: BigInt(0), grossOrderSales: BigInt(0), recordedRefunds: BigInt(0), supplierCostEstimate: BigInt(0), orderCount: 0, ordersWithKnownCost: 0, ordersWithUnknownCost: 0, ordersWithVerifiedPayment: 0, unmatchedPayments: 0, pendingPayments: BigInt(0), pendingPaymentCount: 0, failedPayments: BigInt(0), failedPaymentCount: 0, pendingSupplierOrders: 0, completedOrders: 0, refundRecordCount: 0, legacyRefundedOrdersWithoutRecord: 0 };
}

function bucketFor(map: Map<string, CurrencyTotals>, currency: string) {
  let bucket = map.get(currency);
  if (!bucket) { bucket = newTotals(currency); map.set(currency, bucket); }
  return bucket;
}

function serializeTotals(bucket: CurrencyTotals) {
  const netRevenue = bucket.grossOrderSales - bucket.recordedRefunds;
  const completeCosts = bucket.orderCount === bucket.ordersWithKnownCost;
  return {
    currency: bucket.currency,
    verifiedPayments: formatMinorUnits(bucket.verifiedPayments, bucket.currency),
    grossOrderSales: formatMinorUnits(bucket.grossOrderSales, bucket.currency),
    recordedRefunds: formatMinorUnits(bucket.recordedRefunds, bucket.currency),
    netOrderRevenue: formatMinorUnits(netRevenue, bucket.currency),
    supplierCostEstimate: formatMinorUnits(bucket.supplierCostEstimate, bucket.currency),
    estimatedProfit: completeCosts ? formatMinorUnits(netRevenue - bucket.supplierCostEstimate, bucket.currency) : null,
    paidOrRefundedOrders: bucket.orderCount,
    ordersWithKnownCost: bucket.ordersWithKnownCost,
    ordersWithUnknownCost: bucket.ordersWithUnknownCost,
    ordersWithVerifiedPayment: bucket.ordersWithVerifiedPayment,
    unmatchedSuccessfulPaymentRecords: bucket.unmatchedPayments,
    costCoverageComplete: completeCosts,
    pendingCustomerPayments: formatMinorUnits(bucket.pendingPayments, bucket.currency),
    pendingCustomerPaymentCount: bucket.pendingPaymentCount,
    failedPayments: formatMinorUnits(bucket.failedPayments, bucket.currency),
    failedPaymentCount: bucket.failedPaymentCount,
    pendingSupplierOrders: bucket.pendingSupplierOrders,
    completedOrders: bucket.completedOrders,
    completedRefundRecords: bucket.refundRecordCount,
    legacyRefundedOrdersWithoutRefundRecord: bucket.legacyRefundedOrdersWithoutRecord,
  };
}

async function readData(range: FinanceRange) {
  await connectDB();
  const [paymentActivity, orders, refunds] = await Promise.all([
    Payment.find({ ...paymentDateFilter(range) })
      .select("paymentId orderNumber gateway transactionId amount currency status paidAt createdAt")
      .sort({ paidAt: -1, createdAt: -1 }).lean(),
    Order.find({ ...orderDateFilter(range) })
      .select("orderNumber supplier supplierOrderId amount buyingPrice currency paymentStatus fulfillmentStatus paidAt updatedAt createdAt")
      .sort({ paidAt: -1, createdAt: -1 }).lean(),
    Refund.find({ status: "completed", $or: [{ completedAt: dateRange(range) }, { completedAt: null, updatedAt: dateRange(range) }] })
      .select("refundId orderNumber amount currency status completedAt updatedAt")
      .lean(),
  ]);
  const payments = paymentActivity.filter(payment => (PAYMENT_SUCCESS as readonly string[]).includes(String(payment.status)));
  const relatedOrderNumbers = [...new Set([...payments.map(payment => payment.orderNumber), ...refunds.map(refund => refund.orderNumber)])];
  const relatedOrders = relatedOrderNumbers.length
    ? await Order.find({ orderNumber: { $in: relatedOrderNumbers } })
      .select("orderNumber amount currency paymentStatus paidAt createdAt")
      .lean()
    : [];
  return { payments, paymentActivity, orders, refunds, relatedOrders };
}

export async function getFinanceSummary(range: FinanceRange) {
  const { payments, paymentActivity, orders, refunds, relatedOrders } = await readData(range);
  const relatedByNumber = new Map(relatedOrders.map(order => [order.orderNumber, order]));
  const totals = new Map<string, CurrencyTotals>();
  const matchedOrders = new Set<string>();
  const refundedOrderNumbers = new Set<string>();
  let unmatchedPayments = 0;

  for (const payment of paymentActivity) {
    const status = String(payment.status).toUpperCase();
    const currency = normalizedCurrency(payment.currency);
    const bucket = bucketFor(totals, currency);
    const amount = toMinorUnits(payment.amount, currency);
    if (status === "PENDING" && amount !== null) { bucket.pendingPayments += amount; bucket.pendingPaymentCount += 1; }
    if (status === "FAILED" && amount !== null) { bucket.failedPayments += amount; bucket.failedPaymentCount += 1; }
  }

  for (const payment of payments) {
    const currency = normalizedCurrency(payment.currency);
    const bucket = bucketFor(totals, currency);
    const order = relatedByNumber.get(payment.orderNumber);
    const orderStatus = String(order?.paymentStatus || "").toUpperCase();
    const verified = Boolean(order && ["PAID", "REFUNDED"].includes(orderStatus) && normalizedCurrency(order.currency) === currency && sameAmount(payment.amount, order.amount, currency));
    if (!verified) {
      unmatchedPayments += 1;
      bucket.unmatchedPayments += 1;
      continue;
    }
    const amount = toMinorUnits(payment.amount, currency);
    if (amount !== null) bucket.verifiedPayments += amount;
    matchedOrders.add(payment.orderNumber);
  }

  const orderByNumber = new Map(relatedOrders.map(order => [order.orderNumber, order]));
  for (const refund of refunds) {
    const currency = normalizedCurrency(refund.currency);
    const bucket = bucketFor(totals, currency);
    const linkedOrder = orderByNumber.get(refund.orderNumber);
    const amount = toMinorUnits(refund.amount.toString(), currency);
    if (!linkedOrder || normalizedCurrency(linkedOrder.currency) !== currency || amount === null) {
      bucket.unmatchedPayments += 1;
      continue;
    }
    bucket.recordedRefunds += amount;
    bucket.refundRecordCount += 1;
    refundedOrderNumbers.add(refund.orderNumber);
  }

  for (const order of orders) {
    const currency = normalizedCurrency(order.currency);
    const bucket = bucketFor(totals, currency);
    const amount = toMinorUnits(order.amount, currency);
    if (amount === null) continue;
    bucket.orderCount += 1;
    const refunded = (ORDER_REFUNDED as readonly string[]).includes(String(order.paymentStatus));
    if (!refunded || refundedOrderNumbers.has(order.orderNumber)) bucket.grossOrderSales += amount;
    else bucket.legacyRefundedOrdersWithoutRecord += 1;
    const fulfillment = String(order.fulfillmentStatus || "").toUpperCase();
    if (!refunded && !["COMPLETED", "DELIVERED", "FAILED"].includes(fulfillment)) bucket.pendingSupplierOrders += 1;
    if (!refunded && ["COMPLETED", "DELIVERED"].includes(fulfillment)) bucket.completedOrders += 1;
    if (matchedOrders.has(order.orderNumber)) bucket.ordersWithVerifiedPayment += 1;
    const cost = toMinorUnits(order.buyingPrice ?? 0, currency);
    // The current order schema defaults buyingPrice to zero; zero therefore means missing, not free.
    if (cost !== null && cost > BigInt(0)) {
      bucket.supplierCostEstimate += cost;
      bucket.ordersWithKnownCost += 1;
    } else {
      bucket.ordersWithUnknownCost += 1;
    }
  }

  const latestSnapshots = await SupplierBalanceSnapshot.aggregate([
    { $sort: { checkedAt: -1 } },
    { $group: { _id: { supplierId: "$supplierId", walletId: "$walletId" }, snapshot: { $first: "$$ROOT" } } },
  ]);
  const balanceGroups = new Map<string, { currency: string; source: string; total: Money; suppliers: Set<string> }>();
  for (const item of latestSnapshots) {
    const snapshot = item.snapshot as { supplierId: string; walletId: string; amount: { toString(): string }; currency: string; source: string };
    const source = snapshot.source;
    const currency = normalizedCurrency(snapshot.currency);
    const amount = toMinorUnits(snapshot.amount.toString(), currency);
    if (amount === null) continue;
    const key = `${source}:${currency}`;
    let group = balanceGroups.get(key);
    if (!group) { group = { currency, source, total: BigInt(0), suppliers: new Set<string>() }; balanceGroups.set(key, group); }
    group.total += amount;
    group.suppliers.add(snapshot.supplierId);
  }
  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    currencies: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map(serializeTotals),
    supplierBalances: [...balanceGroups.values()].map(group => ({
      currency: group.currency,
      source: group.source,
      total: formatMinorUnits(group.total, group.currency),
      suppliersWithSnapshots: group.suppliers.size,
      expectedSupplierAccounts: 3,
      coverage: group.suppliers.size === 3 ? "complete" : "partial",
    })).sort((a, b) => a.currency.localeCompare(b.currency) || a.source.localeCompare(b.source)),
    reconciliation: {
      status: unmatchedPayments || [...totals.values()].some(row => row.ordersWithUnknownCost || row.legacyRefundedOrdersWithoutRecord) ? "partial" : "matched",
      unmatchedSuccessfulPaymentRecords: unmatchedPayments,
      note: "Successful payment records are counted only when order status, currency, and amount match. Supplier costs use stored order-time buyingPrice estimates; actual supplier invoices and settled cash balances are not recorded in this database.",
    },
  };
}

export async function getFinanceTransactions(options: FinanceRange & { page: number; limit: number; status?: string; currency?: string }) {
  await connectDB();
  const filter: Record<string, unknown> = { ...paymentDateFilter(options) };
  if (options.status) filter.status = options.status;
  if (options.currency) filter.currency = options.currency;
  const [payments, total] = await Promise.all([
    Payment.find(filter).select("paymentId orderNumber gateway transactionId amount currency status paidAt createdAt").sort({ paidAt: -1, createdAt: -1 }).skip((options.page - 1) * options.limit).limit(options.limit).lean(),
    Payment.countDocuments(filter),
  ]);
  const orders = payments.length ? await Order.find({ orderNumber: { $in: [...new Set(payments.map(payment => payment.orderNumber))] } }).select("orderNumber gameName packageName supplier amount currency paymentStatus fulfillmentStatus buyingPrice").lean() : [];
  const byNumber = new Map(orders.map(order => [order.orderNumber, order]));
  const rows = payments.map(payment => {
    const order = byNumber.get(payment.orderNumber);
    const currency = normalizedCurrency(payment.currency);
    const isMatched = Boolean(order && ["PAID", "REFUNDED"].includes(String(order.paymentStatus).toUpperCase()) && normalizedCurrency(order.currency) === currency && sameAmount(payment.amount, order.amount, currency));
    return {
      paymentId: payment.paymentId,
      transactionId: payment.transactionId || null,
      orderNumber: payment.orderNumber,
      gateway: payment.gateway,
      paymentStatus: payment.status,
      verification: isMatched ? "matched" : "needs-review",
      amount: payment.amount,
      currency,
      order: order ? { gameName: order.gameName, packageName: order.packageName, supplier: order.supplier, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, buyingPriceEstimate: order.buyingPrice ?? null } : null,
      createdAt: payment.paidAt || payment.createdAt,
    };
  });
  return { rows, pagination: { page: options.page, limit: options.limit, total, totalPages: Math.ceil(total / options.limit) } };
}

export async function getFinanceRevenueChart(range: FinanceRange) {
  const { payments, orders, refunds, relatedOrders } = await readData(range);
  const relatedByNumber = new Map(relatedOrders.map(order => [order.orderNumber, order]));
  const points = new Map<string, { date: string; currency: string; verifiedPayments: Money; grossOrderSales: Money; refunds: Money }>();
  const getPoint = (date: Date, currency: string) => {
    const day = date.toISOString().slice(0, 10);
    const key = `${day}:${currency}`;
    let point = points.get(key);
    if (!point) { point = { date: day, currency, verifiedPayments: BigInt(0), grossOrderSales: BigInt(0), refunds: BigInt(0) }; points.set(key, point); }
    return point;
  };
  for (const payment of payments) {
    const currency = normalizedCurrency(payment.currency);
    const order = relatedByNumber.get(payment.orderNumber);
    if (!order || !["PAID", "REFUNDED"].includes(String(order.paymentStatus).toUpperCase()) || normalizedCurrency(order.currency) !== currency || !sameAmount(payment.amount, order.amount, currency)) continue;
    const date = payment.paidAt || payment.createdAt;
    const amount = toMinorUnits(payment.amount, currency);
    if (amount !== null) getPoint(date, currency).verifiedPayments += amount;
  }
  for (const order of orders) {
    const currency = normalizedCurrency(order.currency);
    const refunded = (ORDER_REFUNDED as readonly string[]).includes(String(order.paymentStatus));
    const completedRefundOrder = refunds.some(refund => refund.orderNumber === order.orderNumber && normalizedCurrency(refund.currency) === currency);
    if (refunded && !completedRefundOrder) continue;
    const date = order.paidAt || order.createdAt;
    const amount = toMinorUnits(order.amount, currency);
    if (amount === null) continue;
    const point = getPoint(date, currency);
    point.grossOrderSales += amount;
  }
  const orderByNumber = new Map(relatedOrders.map(order => [order.orderNumber, order]));
  for (const refund of refunds) {
    const currency = normalizedCurrency(refund.currency);
    const order = orderByNumber.get(refund.orderNumber);
    if (!order || normalizedCurrency(order.currency) !== currency) continue;
    const date = refund.completedAt || refund.updatedAt;
    const amount = toMinorUnits(refund.amount.toString(), currency);
    if (amount !== null) getPoint(date, currency).refunds += amount;
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency)).map(point => ({
    date: point.date,
    currency: point.currency,
    verifiedPayments: formatMinorUnits(point.verifiedPayments, point.currency),
    grossOrderSales: formatMinorUnits(point.grossOrderSales, point.currency),
    refunds: formatMinorUnits(point.refunds, point.currency),
  }));
}
