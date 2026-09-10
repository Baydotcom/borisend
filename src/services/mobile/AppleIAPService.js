/**
 * AppleIAPService — Apple In-App Purchase Client Service Abstraction
 *
 * RC20.3 — Isolates all StoreKit 2 interactions from React UI.
 *
 * The application must never call StoreKit directly.
 * All purchase/restore operations go through this service.
 *
 * NATIVE PLUGIN: This service uses registerPlugin("AppleIAP") — a custom
 * Capacitor local plugin whose native source (Swift / StoreKit 2) MUST be
 * written in the generated ios/ project. Until that native source exists,
 * all methods report { supported: false }. See docs/NATIVE_BUILD_AND_DEVICE_QA.md
 * §RC20.3 for the exact native implementation contract.
 *
 * ARCHITECTURE:
 *   React UI → AppleIAPService → Capacitor "AppleIAP" plugin → StoreKit 2
 *   Purchase result (signed JWS) → verifyAppleTransaction backend function
 *
 * The client NEVER determines purchase success on its own.
 * The signed transaction is always verified server-side.
 */

import PlatformService from "./PlatformService";
import { base44 } from "@/api/base44Client";

let _AppleIAPPlugin = null;

async function _getPlugin() {
  if (_AppleIAPPlugin) return _AppleIAPPlugin;
  if (!PlatformService.isIOS()) return null;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    _AppleIAPPlugin = registerPlugin("AppleIAP");
  } catch {
    _AppleIAPPlugin = null;
  }
  return _AppleIAPPlugin;
}

const AppleIAPService = {
  /**
   * Whether Apple IAP is supported on this platform build.
   * Returns false on web, Android, and until the native AppleIAP plugin exists.
   */
  async isAvailable() {
    if (!PlatformService.isIOS()) return false;
    const plugin = await _getPlugin();
    return !!plugin;
  },

  /**
   * Load available product information from StoreKit.
   * @returns { supported, products } where products = [{ productId, price, localizedPrice, title, description }]
   */
  async loadProducts() {
    const plugin = await _getPlugin();
    if (!plugin) return { supported: false, products: [] };
    try {
      const result = await plugin.getProducts({
        productIds: [
          // These are read from server config — the client doesn't hardcode them.
          // The native layer reads product IDs from its own configuration or
          // from the App Store Connect product identifiers embedded in the app.
        ],
      });
      return { supported: true, products: result?.products || [] };
    } catch (e) {
      console.error("[AppleIAPService] loadProducts failed:", e);
      return { supported: true, products: [], error: e.message };
    }
  },

  /**
   * Initiate a monthly subscription purchase (£4.99/mo).
   * Returns the server verification result.
   */
  async purchaseMonthly() {
    return this._purchase("monthly");
  },

  /**
   * Initiate an annual subscription purchase (£49.99/yr).
   * Returns the server verification result.
   */
  async purchaseAnnual() {
    return this._purchase("annual");
  },

  /**
   * Internal purchase flow:
   * 1. Call native StoreKit purchase
   * 2. Get signed transaction JWS
   * 3. Send to verifyAppleTransaction backend function
   * 4. Return verification result
   * 5. Finish transaction on success
   */
  async _purchase(interval) {
    const plugin = await _getPlugin();
    if (!plugin) return { supported: false, error: "Apple In-App Purchase is not available." };

    try {
      // Native StoreKit 2 purchase — returns the signed transaction JWS
      const purchaseResult = await plugin.purchase({ interval });
      const signedTransaction = purchaseResult?.signedTransaction;
      if (!signedTransaction) {
        return { supported: true, success: false, error: "No transaction was returned." };
      }

      // Verify server-side
      const verifyResult = await base44.functions.invoke("verifyAppleTransaction", {
        signedTransaction,
        action: "purchase",
      });

      if (verifyResult.data?.success) {
        // Finish the transaction only after server verification succeeds
        try {
          await plugin.finishTransaction({ transactionId: purchaseResult.transactionId });
        } catch (e) {
          console.warn("[AppleIAPService] finishTransaction failed:", e);
        }
        return { supported: true, success: true };
      }

      return {
        supported: true,
        success: false,
        conflict: verifyResult.data?.conflict,
        error: verifyResult.data?.error || "Server verification failed.",
      };
    } catch (e) {
      // StoreKit purchase errors (user cancelled, network, etc.)
      const msg = String((e && (e.message || e)) || "");
      if (/cancel/i.test(msg)) {
        return { supported: true, success: false, cancelled: true };
      }
      return { supported: true, success: false, error: msg || "Purchase failed." };
    }
  },

  /**
   * Restore previous Apple purchases.
   * Requests current entitlements from StoreKit, verifies each server-side.
   * Idempotent — does not create duplicate memberships.
   */
  async restorePurchases() {
    const plugin = await _getPlugin();
    if (!plugin) return { supported: false, error: "Apple In-App Purchase is not available." };

    try {
      const result = await plugin.getCurrentEntitlements();
      const transactions = result?.transactions || [];
      if (transactions.length === 0) {
        return { supported: true, success: true, restored: 0, message: "No previous purchases found." };
      }

      // Verify each signed transaction server-side
      let restored = 0;
      let lastError = null;
      for (const txn of transactions) {
        if (!txn.signedTransaction) continue;
        try {
          const verifyResult = await base44.functions.invoke("verifyAppleTransaction", {
            signedTransaction: txn.signedTransaction,
            action: "restore",
          });
          if (verifyResult.data?.success) restored++;
          else if (verifyResult.data?.conflict) {
            lastError = "This Apple subscription is linked to another account.";
          }
        } catch (e) {
          lastError = e.message || "Verification failed.";
        }
      }

      return {
        supported: true,
        success: restored > 0,
        restored,
        conflict: lastError && lastError.includes("another account"),
        error: restored === 0 ? (lastError || "No valid purchases to restore.") : undefined,
      };
    } catch (e) {
      return { supported: true, success: false, error: e.message || "Restore failed." };
    }
  },

  /**
   * Sync current Apple entitlements with the server.
   * Called on app launch/resume to ensure the backend has the latest state.
   */
  async syncCurrentEntitlements() {
    const plugin = await _getPlugin();
    if (!plugin) return { supported: false };
    try {
      const result = await plugin.getCurrentEntitlements();
      const transactions = result?.transactions || [];
      for (const txn of transactions) {
        if (!txn.signedTransaction) continue;
        try {
          await base44.functions.invoke("verifyAppleTransaction", {
            signedTransaction: txn.signedTransaction,
            action: "sync",
          });
        } catch {
          // non-blocking — sync is best-effort
        }
      }
      return { supported: true, synced: transactions.length };
    } catch {
      return { supported: true, synced: 0 };
    }
  },

  /**
   * Open Apple's subscription management sheet (iOS 15+).
   * This is the ONLY way to manage/cancel an Apple-backed subscription.
   * BoriSend backend never cancels Apple subscriptions directly.
   */
  async openManageSubscriptions() {
    const plugin = await _getPlugin();
    if (!plugin) return { supported: false };
    try {
      await plugin.openManageSubscriptions();
      return { supported: true, success: true };
    } catch (e) {
      return { supported: true, success: false, error: e.message };
    }
  },
};

export default AppleIAPService;