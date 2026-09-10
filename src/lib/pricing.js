/**
 * Pricing calculation utilities for BoriSend subscription plans.
 * Used by both the admin billing console and the user-facing subscription page.
 */

export function calculateAnnualPricing(monthlyPrice, discountPercentage) {
  const mp = Number(monthlyPrice) || 0;
  const dp = Number(discountPercentage) || 0;
  const originalAnnual = mp * 12;
  const discountAmount = originalAnnual * (dp / 100);
  const finalAnnual = originalAnnual - discountAmount;
  return {
    originalAnnual: Math.round(originalAnnual * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalAnnual: Math.round(finalAnnual * 100) / 100,
    roundedDiscountPct: Math.round(dp),
  };
}

export function formatCurrency(amount, currency = "GBP") {
  const symbol =
    currency === "GBP" ? "£" :
    currency === "EUR" ? "€" :
    currency === "USD" ? "$" : "£";
  return `${symbol}${Number(amount || 0).toFixed(2)}`;
}