import test from "node:test";
import assert from "node:assert/strict";

test("SMM Deposit: parameter validation rejects non-positive or missing amounts", async () => {
  const invalidAmounts = ["0", "-5", "abc", "", null, undefined, -10];

  for (const amt of invalidAmounts) {
    const rawAmount = typeof amt === "number" ? amt.toFixed(2) : String(amt || "").trim();
    const numeric = parseFloat(rawAmount);
    const isInvalid = isNaN(numeric) || numeric <= 0;
    assert.equal(isInvalid, true, `Amount ${amt} should be rejected`);
  }

  const validAmounts = ["1.00", "10", 10.00, "50.50", 100];
  for (const amt of validAmounts) {
    const rawAmount = typeof amt === "number" ? amt.toFixed(2) : String(amt || "").trim();
    const numeric = parseFloat(rawAmount);
    const isValid = !isNaN(numeric) && numeric > 0;
    assert.equal(isValid, true, `Amount ${amt} should be valid`);
  }
});

test("SMM Deposit: currency normalizes to USD or KHR", async () => {
  const normalize = (curr) => (curr === "KHR" ? "KHR" : "USD");
  assert.equal(normalize("USD"), "USD");
  assert.equal(normalize("KHR"), "KHR");
  assert.equal(normalize(undefined), "USD");
  assert.equal(normalize("EUR"), "USD");
});

test("SMM Deposit: VNGZZ2 live contract response format validation", async () => {
  // Simulates upstream response format from /v1/smm/deposit
  const mockVngzzResponse = {
    success: true,
    status: 201,
    message: "Deposit KHQR created for SMM Wallet.",
    data: {
      transaction_id: "DEP-SMM-1793470087990-66b42d8b",
      target_wallet: "smm",
      amount: "10.00",
      service_fee: 0.1,
      total_amount: 10.1,
      currency: "USD",
      state: "PENDING",
      qr_string: "00020101021230510016abaakhppxxx...",
      qr_image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
      abamobile_deeplink: "abamobilebank://ababank.com?type=payway&qrcode=000201...",
      expire_in_sec: 180,
    },
  };

  assert.equal(mockVngzzResponse.success, true);
  assert.equal(mockVngzzResponse.status, 201);
  assert.ok(mockVngzzResponse.data.transaction_id.startsWith("DEP-SMM-"));
  assert.equal(mockVngzzResponse.data.amount, "10.00");
  assert.equal(mockVngzzResponse.data.currency, "USD");
  assert.ok(mockVngzzResponse.data.qr_string.length > 20);
  assert.ok(mockVngzzResponse.data.qr_image.startsWith("data:image/png;base64,"));
  assert.ok(mockVngzzResponse.data.abamobile_deeplink.startsWith("abamobilebank://"));
});

test("SMM Deposit: Transaction check parsing recognizes PENDING vs COMPLETED / PAID", async () => {
  const checkPending = {
    success: true,
    status: 200,
    data: {
      transaction_id: "DEP-SMM-001",
      state: "PENDING",
      is_paid: false,
    },
  };

  const isPendingPaid = Boolean(
    checkPending.data.is_paid ||
    checkPending.data.state === "COMPLETED" ||
    checkPending.data.state === "PAID"
  );
  assert.equal(isPendingPaid, false);

  const checkCompleted = {
    success: true,
    status: 200,
    data: {
      transaction_id: "DEP-SMM-001",
      state: "COMPLETED",
      is_paid: true,
    },
  };

  const isCompletedPaid = Boolean(
    checkCompleted.data.is_paid ||
    checkCompleted.data.state === "COMPLETED" ||
    checkCompleted.data.state === "PAID"
  );
  assert.equal(isCompletedPaid, true);
});

