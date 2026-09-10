/**
 * ContactImportService — Canonical device contact import service (RC18.2.2).
 *
 * The single capability router for contact import across all platforms:
 *
 *   if native iOS    → @capacitor-community/contacts pickContact() (system picker)
 *   else if native Android → @capacitor-community/contacts pickContact() (system picker)
 *   else if navigator.contacts (Chrome Android web/PWA) → W3C Contact Picker API
 *   else → unsupported / manual fallback
 *
 * Native (iOS/Android): Uses the system-owned contact picker (CNContactPickerViewController
 * on iOS, Android Contact Picker Intent). Privacy-first: the user selects specific contacts,
 * BoriSend does NOT access the full address book. No READ_CONTACTS needed on iOS;
 * Android may require it for reading picked contact details.
 *
 * pickContact() returns ONE contact per call. DeviceContactPicker loops for multi-select.
 *
 * Web/PWA (Chrome Android): W3C Contact Picker API (navigator.contacts.select) supports
 * multi-select in one call.
 *
 * RC18.2 §13: Only name + phone extracted (data minimization).
 * RC18.2 §14: Multiple phone numbers → user selects which.
 * RC18.2 §15: Contacts without phone numbers are excluded.
 * RC18.2 §1: Importing contacts consumes 0 Recipient Units.
 */
import { normalizePhone, isValidPhone } from "@/lib/phoneUtils";
import PlatformService from "@/services/mobile/PlatformService";

// ── Native plugin lazy-loader (only loads on native platforms) ──
let _ContactsPlugin = null;

async function _getNativeContactsPlugin() {
  if (_ContactsPlugin) return _ContactsPlugin;
  if (!PlatformService.isNative()) return null;
  try {
    const mod = await import("@capacitor-community/contacts");
    _ContactsPlugin = mod.Contacts;
  } catch {
    _ContactsPlugin = null;
  }
  return _ContactsPlugin;
}

export const ContactImportService = {
  /**
   * Determine which contact import provider is available.
   * Returns: 'native' | 'w3c' | 'unsupported'
   *
   * RC18.2.2 §41: Does not assume native availability from platform alone —
   * the plugin is verified at pick time via _getNativeContactsPlugin().
   */
  getProvider() {
    if (PlatformService.isNative()) return "native";
    if (
      typeof navigator !== "undefined" &&
      navigator.contacts &&
      typeof navigator.contacts.select === "function"
    ) {
      return "w3c";
    }
    return "unsupported";
  },

  /**
   * Feature-detect whether device contact picking is available.
   */
  isSupported() {
    return this.getProvider() !== "unsupported";
  },

  /**
   * Check current permission status.
   * Returns: 'prompt' | 'granted' | 'denied' | 'limited' | 'not_supported'
   */
  async checkPermission() {
    const provider = this.getProvider();
    if (provider === "native") {
      const Contacts = await _getNativeContactsPlugin();
      if (!Contacts) return "not_supported";
      try {
        const status = await Contacts.checkPermissions();
        return status.contacts;
      } catch {
        return "not_supported";
      }
    }
    if (provider === "w3c") return "prompt";
    return "not_supported";
  },

  /**
   * Request contact permission (native only).
   * W3C API prompts on select() — no separate request.
   */
  async requestPermission() {
    const provider = this.getProvider();
    if (provider === "native") {
      const Contacts = await _getNativeContactsPlugin();
      if (!Contacts) return "not_supported";
      try {
        const status = await Contacts.requestPermissions();
        return status.contacts;
      } catch {
        return "denied";
      }
    }
    if (provider === "w3c") return "prompt";
    return "not_supported";
  },

  /**
   * Pick contacts from the device.
   *
   * Native: Opens system picker, returns ONE contact (single-select).
   *   DeviceContactPicker loops for multi-select.
   * W3C: Opens browser picker, returns ALL selected contacts at once.
   *
   * Returns: { success, contacts, reason?, message? }
   *   contacts is always an array in W3C-compatible format: { name: [string], tel: [string] }
   */
  async pickContacts() {
    const provider = this.getProvider();
    if (provider === "native") return this._pickNative();
    if (provider === "w3c") return this._pickW3C();
    return { success: false, reason: "not_supported" };
  },

  /**
   * Native pick — uses @capacitor-community/contacts pickContact().
   * System-owned picker (CNContactPickerViewController / Android Contact Picker).
   */
  async _pickNative() {
    const Contacts = await _getNativeContactsPlugin();
    if (!Contacts) return { success: false, reason: "not_supported" };

    // Check/request permission (plugin may require it)
    try {
      let perm = await Contacts.checkPermissions();
      if (perm.contacts === "prompt" || perm.contacts === "prompt-with-rationale") {
        perm = await Contacts.requestPermissions();
      }
      if (perm.contacts === "denied") {
        return { success: false, reason: "denied" };
      }
    } catch {
      // Some implementations may not gate the picker behind permission — continue
    }

    // Pick a single contact via the system picker
    try {
      const result = await Contacts.pickContact({
        projection: { name: true, phones: true },
      });
      if (!result || !result.contact) {
        return { success: false, reason: "cancelled" };
      }
      const normalized = this._normalizeNativeContact(result.contact);
      return { success: true, contacts: [normalized] };
    } catch (e) {
      const msg = (e && (e.message || String(e))) || "";
      if (
        e?.name === "cancel" ||
        msg.toLowerCase().includes("cancel") ||
        e?.code === "cancel"
      ) {
        return { success: false, reason: "cancelled" };
      }
      return { success: false, reason: "error", message: msg };
    }
  },

  /**
   * W3C pick — navigator.contacts.select() with multi-select.
   */
  async _pickW3C() {
    try {
      const contacts = await navigator.contacts.select(
        ["name", "tel"],
        { multiple: true }
      );
      return { success: true, contacts };
    } catch (e) {
      if (e.name === "AbortError" || e.name === "SecurityError") {
        return { success: false, reason: "cancelled" };
      }
      return { success: false, reason: "error", message: e.message };
    }
  },

  /**
   * Normalize a native ContactPayload to W3C-compatible format.
   * Native: { name: { display, given, family }, phones: [{ number, type, label }] }
   * W3C:    { name: [string], tel: [string] }
   *
   * RC18.2 §13: Only name + phone extracted. No photos, email, address, etc.
   */
  _normalizeNativeContact(contact) {
    const c = contact || {};
    const n = c.name || {};
    const display =
      n.display ||
      [n.given, n.middle, n.family].filter(Boolean).join(" ").trim() ||
      "";
    const nameParts = display ? [display] : [];

    const telParts = [];
    const phones = c.phones || [];
    for (const p of phones) {
      if (p && p.number) telParts.push(p.number);
    }

    return { name: nameParts, tel: telParts };
  },

  /**
   * Process raw device contacts into BoriSend-importable format.
   * Works on W3C-format contacts ({ name: [string], tel: [string] }) —
   * native contacts are normalized to this format by _normalizeNativeContact.
   *
   * Returns: {
   *   importable: [{display_name, first_name, last_name, phone_number, phone_normalized}],
   *   multiNumber: [{display_name, numbers: [{original, normalized, valid}]}],
   *   noPhone: [{display_name}]
   * }
   */
  processDeviceContacts(contacts) {
    const importable = [];
    const multiNumber = [];
    const noPhone = [];

    for (const c of contacts) {
      const name = Array.isArray(c.name)
        ? (c.name[0] || "").trim()
        : (c.name || "").trim();

      if (!name) continue;

      const tel = Array.isArray(c.tel)
        ? c.tel.filter((t) => t && t.trim())
        : c.tel
          ? [c.tel]
          : [];

      if (tel.length === 0) {
        noPhone.push({ display_name: name });
      } else if (tel.length === 1) {
        const normalized = normalizePhone(tel[0]);
        if (isValidPhone(tel[0])) {
          const parts = name.split(" ");
          importable.push({
            display_name: name,
            first_name: parts[0] || name,
            last_name: parts.slice(1).join(" ") || "",
            phone_number: tel[0].trim(),
            phone_normalized: normalized,
          });
        } else {
          noPhone.push({ display_name: name });
        }
      } else {
        multiNumber.push({
          display_name: name,
          numbers: tel.map((t) => ({
            original: t.trim(),
            normalized: normalizePhone(t),
            valid: isValidPhone(t),
          })),
        });
      }
    }

    return { importable, multiNumber, noPhone };
  },

  /**
   * Resolve multi-number contacts by selecting a specific phone for each.
   */
  resolveMultiNumber(contact, selectedPhone) {
    const normalized = normalizePhone(selectedPhone);
    const parts = contact.display_name.split(" ");
    return {
      display_name: contact.display_name,
      first_name: parts[0] || contact.display_name,
      last_name: parts.slice(1).join(" ") || "",
      phone_number: selectedPhone.trim(),
      phone_normalized: normalized,
    };
  },

  /**
   * Import contacts via the backend importContacts function.
   * RC18.2 §36: Backend authenticates, normalizes, deduplicates, bulk-creates.
   * Returns: { created, existing, skipped }
   */
  async importContacts(contacts) {
    const { base44 } = await import("@/api/base44Client");
    const res = await base44.functions.invoke("importContacts", { contacts });
    return res.data || res;
  },
};

export default ContactImportService;