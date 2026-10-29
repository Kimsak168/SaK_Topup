export const SMM_CUSTOMER_MARGIN = 0.15;

export function calculateSmmCustomerRate(wholesaleRate: number) {
  return Math.ceil((wholesaleRate * (1 + SMM_CUSTOMER_MARGIN)) * 100) / 100;
}

export function calculateSmmOrderAmount(customerRatePerThousand: number, quantity: number) {
  const rawTotal = (customerRatePerThousand * quantity) / 1000;
  return Math.max(0.1, Math.ceil(rawTotal * 100) / 100);
}
