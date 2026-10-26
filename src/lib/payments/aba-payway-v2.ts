/**
 * Provider-based payment module export for ABA PayWay V2
 * Adapts to the project's internal service implementation.
 */
export * from "@/lib/services/vngzzPayWayService";
export {
  generateVngZz2Qr as createPayWayV2Payment,
  checkVngZz2Transaction as verifyPayWayV2Transaction,
  checkVngZz2Health as checkPayWayV2Health,
  verifyVngZz2WebhookSignature as verifyPayWayV2Webhook,
  isVngZz2Configured as isPayWayV2Configured,
} from "@/lib/services/vngzzPayWayService";
