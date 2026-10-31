import "server-only";
import { reconcilePendingPaymentsBatch } from "@/lib/services/cronPaymentWorker";
import { reconcileSupplierOrdersBatch } from "@/lib/services/cronSupplierWorker";

export async function reconcilePendingOrderStatuses(limit = 5) {
  const payments = await reconcilePendingPaymentsBatch(limit, 12000);
  const supplierOrders = await reconcileSupplierOrdersBatch(limit, 12000);
  return {
    checked: payments.checked + supplierOrders.checked,
    payments,
    supplierOrders,
  };
}
