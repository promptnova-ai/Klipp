import {
  buildAzulRequestAuthHash,
  calculateItbisMinor,
  constantTimeEquals,
  createCheckoutToken,
  sha256Hex,
  toMinorUnits,
  verifyAzulResponseAuthHash,
  verifyCheckoutToken,
  type AzulConfig,
} from "./azul.ts";

Deno.test("AZUL request AuthHash uses the documented concatenation order and UTF-16LE message", async () => {
  const key = "test-secret-azul-key";
  const hash = await buildAzulRequestAuthHash({
    merchantId: "123456",
    merchantName: "KLIPP",
    merchantType: "E-Commerce",
    currencyCode: "DOP",
    orderNumber: "1234567890123456",
    amountMinor: "123450",
    itbisMinor: "18805",
    approvedUrl: "https://example.com/approved",
    declinedUrl: "https://example.com/declined",
    cancelUrl: "https://example.com/cancel",
  }, key);
  if (hash !== "fbe476a381273bad1e8b6e2787c924aae63352dabe8fa859ab886dc427056797bea23c7a21c33dddc2f7717b7bd6e7026e21c56e3fdb8d70a4edbba40ff8f178") {
    throw new Error("AZUL request AuthHash does not match the known test vector");
  }
});

Deno.test("AZUL response AuthHash verifies all returned transaction fields", async () => {
  const key = "test-secret-azul-key";
  const fields = {
    orderNumber: "1234567890123456",
    amountMinor: "123450",
    authorizationCode: "AUTH123",
    dateTime: "2026-11-12 12:00:00",
    responseCode: "00",
    isoCode: "00",
    responseMessage: "Approved",
    errorDescription: "",
    rrn: "RRN123",
  };
  const hash = "67ef2e5bc4cafc9a7594ae98781d0e6698d6ef0f855ec85a0e2a606e17212584eaeb6371db78c8cc2b3fcfb1c049d40d8af11404f4d6ce646d75d64ccdcbae9a";
  if (!await verifyAzulResponseAuthHash(fields, hash, key)) {
    throw new Error("Valid AZUL response AuthHash was rejected");
  }
  if (await verifyAzulResponseAuthHash({ ...fields, amountMinor: "123451" }, hash, key)) {
    throw new Error("Manipulated AZUL response amount was accepted");
  }
});

Deno.test("checkout token is signed, expires and cannot be modified", async () => {
  const token = await createCheckoutToken({
    paymentId: "11111111-1111-4111-8111-111111111111",
    bookingId: "22222222-2222-4222-8222-222222222222",
    exp: Math.floor(Date.now() / 1000) + 60,
    nonce: "qa-nonce",
  }, "a-long-test-secret-with-more-than-32-characters");
  const payload = await verifyCheckoutToken(token, "a-long-test-secret-with-more-than-32-characters");
  if (!payload || payload.paymentId !== "11111111-1111-4111-8111-111111111111") {
    throw new Error("Valid checkout token was rejected");
  }
  if (await verifyCheckoutToken(token + "x", "a-long-test-secret-with-more-than-32-characters")) {
    throw new Error("Modified checkout token was accepted");
  }
  if (await verifyCheckoutToken(token, "different-long-secret-with-more-than-32-characters")) {
    throw new Error("Checkout token signed with another secret was accepted");
  }
});

Deno.test("money helpers keep DOP minor units and inclusive ITBIS", () => {
  if (toMinorUnits(123.45) !== "12345") throw new Error("DOP minor-unit conversion failed");
  const config = { itbisExempt: false, itbisRate: 0.18 } as AzulConfig;
  if (calculateItbisMinor(11800, config) !== "1800") throw new Error("Inclusive ITBIS calculation failed");
  const exempt = { itbisExempt: true, itbisRate: null } as AzulConfig;
  if (calculateItbisMinor(11800, exempt) !== "000") throw new Error("Exempt ITBIS formatting failed");
});

Deno.test("constant-time comparison helper rejects unequal signatures", () => {
  if (!constantTimeEquals("abcdef", "abcdef")) throw new Error("Equal strings did not match");
  if (constantTimeEquals("abcdef", "abcdeg")) throw new Error("Different strings matched");
  if (constantTimeEquals("abcdef", "abc")) throw new Error("Different length strings matched");
});
