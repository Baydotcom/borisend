import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, X, Smartphone, Check, AlertTriangle, Users } from "lucide-react";
import ContactImportService from "@/services/contacts/ContactImportService";
import { toast } from "@/components/ui/use-toast";

/**
 * RC18.2 DeviceContactPicker — Orchestrates the device contact import flow.
 *
 * States: explaining → picking → multi_number (if needed) → importing → result
 *
 * §8: Permission is user-initiated (never on page load).
 * §9: Pre-permission explanation shown before picker opens.
 * §10: Denied permission shows Try Again + Manual fallback.
 * §13: Only name + phone extracted.
 * §14: Multiple phone numbers → user selects which.
 * §25: Concise result summary (no giant toast).
 * §40: User selects specific contacts (no full address book upload).
 */
export default function DeviceContactPicker({ onClose, onImported }) {
  const [stage, setStage] = useState("explaining");
  const [multiNumberContacts, setMultiNumberContacts] = useState([]);
  const [phoneChoices, setPhoneChoices] = useState({});
  const [importable, setImportable] = useState([]);
  const [noPhoneCount, setNoPhoneCount] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [accumulatedContacts, setAccumulatedContacts] = useState([]);

  const supported = ContactImportService.isSupported();
  const provider = ContactImportService.getProvider();
  const isNative = provider === "native";

  // ── Process accumulated contacts into importable/multiNumber/noPhone ──
  const processAndImport = (contacts) => {
    const { importable: ready, multiNumber, noPhone } =
      ContactImportService.processDeviceContacts(contacts);

    setImportable(ready);
    setNoPhoneCount(noPhone.length);
    setMultiNumberContacts(multiNumber);

    if (multiNumber.length > 0) {
      setStage("multi_number");
    } else {
      doImport(ready);
    }
  };

  // ── Start the OS contact picker ──
  const startPicking = async () => {
    setStage("picking");
    setError(null);

    const pickRes = await ContactImportService.pickContacts();

    if (!pickRes.success) {
      if (pickRes.reason === "not_supported") {
        setStage("unsupported");
      } else if (pickRes.reason === "denied") {
        setStage("denied");
      } else if (pickRes.reason === "cancelled") {
        // RC18.2.2 §42: No error toast on cancel. If we already have
        // accumulated contacts, return to reviewing instead of cancelled.
        if (accumulatedContacts.length > 0) {
          setStage("reviewing");
        } else {
          setStage("cancelled");
        }
      } else {
        setError(pickRes.message || "Could not access contacts");
        setStage("error");
      }
      return;
    }

    if (isNative) {
      // Native pickContact returns ONE contact — accumulate and show reviewing
      const newAccumulated = [...accumulatedContacts, ...pickRes.contacts];
      setAccumulatedContacts(newAccumulated);
      setStage("reviewing");
    } else {
      // W3C returns all contacts at once — process directly
      processAndImport(pickRes.contacts);
    }
  };

  // ── Import from reviewing stage (native multi-pick loop) ──
  const importFromReviewing = () => {
    processAndImport(accumulatedContacts);
  };

  // ── Pick another contact (native loop) ──
  const pickAnother = () => {
    startPicking();
  };

  // ── Clear accumulated and restart ──
  const restartFlow = () => {
    setAccumulatedContacts([]);
    setImportable([]);
    setMultiNumberContacts([]);
    setPhoneChoices({});
    setNoPhoneCount(0);
    setStage("explaining");
  };

  // ── Confirm phone choices for multi-number contacts ──
  const confirmPhoneChoices = () => {
    const resolved = multiNumberContacts.map((c) => {
      const chosen = phoneChoices[c.display_name] || c.numbers[0]?.original;
      return ContactImportService.resolveMultiNumber(c, chosen);
    });
    doImport([...importable, ...resolved]);
  };

  // ── Call backend import ──
  const doImport = async (allContacts) => {
    setStage("importing");
    try {
      const res = await ContactImportService.importContacts(allContacts);
      setResult(res);
      setStage("result");
      if (onImported) onImported(res);
    } catch (e) {
      setError(e.message);
      setStage("error");
    }
  };

  // ── Render ──
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto nav-safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-semibold">Import from Phone</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stage: Explaining (pre-permission) */}
        {stage === "explaining" && (
          <ExplainingStage supported={supported} isNative={isNative} onStart={startPicking} />
        )}

        {/* Stage: Picking */}
        {stage === "picking" && (
          <div className="flex flex-col items-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Opening contact picker…</p>
          </div>
        )}

        {/* Stage: Multi-number selection */}
        {stage === "multi_number" && (
          <MultiNumberStage
            contacts={multiNumberContacts}
            choices={phoneChoices}
            onChoice={(name, phone) => setPhoneChoices({ ...phoneChoices, [name]: phone })}
            onConfirm={confirmPhoneChoices}
            readyCount={importable.length}
            noPhoneCount={noPhoneCount}
          />
        )}

        {/* Stage: Importing */}
        {stage === "importing" && (
          <div className="flex flex-col items-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Importing contacts…</p>
          </div>
        )}

        {/* Stage: Result */}
        {stage === "result" && result && (
          <ResultStage result={result} onClose={onClose} />
        )}

        {/* Stage: Reviewing (native multi-pick accumulation) */}
        {stage === "reviewing" && (
          <ReviewingStage
            contacts={accumulatedContacts}
            onPickAnother={pickAnother}
            onImport={importFromReviewing}
            onClear={restartFlow}
          />
        )}

        {/* Stage: Denied (permission denied) */}
        {stage === "denied" && (
          <DeniedStage onClose={onClose} onRetry={startPicking} />
        )}

        {/* Stage: Cancelled */}
        {stage === "cancelled" && (
          <div className="text-center py-6">
            <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Contact picker cancelled</p>
            <p className="text-xs text-muted-foreground mb-4">No contacts were imported.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
              <Button onClick={startPicking} className="flex-1">Try Again</Button>
            </div>
          </div>
        )}

        {/* Stage: Unsupported */}
        {stage === "unsupported" && (
          <UnsupportedStage onClose={onClose} />
        )}

        {/* Stage: Error */}
        {stage === "error" && (
          <div className="text-center py-6">
            <AlertTriangle className="w-10 h-10 text-destructive/40 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Could not import</p>
            <p className="text-xs text-muted-foreground mb-4">{error}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
              <Button onClick={startPicking} className="flex-1">Try Again</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function ExplainingStage({ supported, isNative, onStart }) {
  if (!supported) return <UnsupportedStage />;
  return (
    <div className="py-2">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Smartphone className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Choose contacts from your phone</p>
          <p className="text-xs text-muted-foreground mt-0.5">Select who you want to add to BoriSend.</p>
        </div>
      </div>
      <div className="bg-muted/50 rounded-xl p-3 mb-4">
        <p className="text-xs text-muted-foreground">
          Your phone's contact picker will open. You choose which contacts to import —
          BoriSend does not access your full address book.
          {isNative && " Pick contacts one at a time, then review before importing."}
        </p>
      </div>
      <Button onClick={onStart} className="w-full h-11 rounded-xl">
        <Smartphone className="w-4 h-4 mr-2" /> Choose Contacts
      </Button>
    </div>
  );
}

function ReviewingStage({ contacts, onPickAnother, onImport, onClear }) {
  // Preview the accumulated contacts (name + first phone)
  const preview = contacts.map((c) => {
    const name = Array.isArray(c.name) ? (c.name[0] || "").trim() : (c.name || "").trim();
    const tel = Array.isArray(c.tel) ? c.tel.filter((t) => t && t.trim()) : [];
    return { name, phone: tel[0] || "" };
  }).filter((c) => c.name);

  const count = preview.length;
  return (
    <div>
      <p className="text-sm font-medium mb-1">{count} contact{count !== 1 ? "s" : ""} selected</p>
      <p className="text-xs text-muted-foreground mb-4">
        Pick more or import these contacts now.
      </p>
      <div className="max-h-48 overflow-y-auto space-y-1.5 mb-4">
        {preview.map((c, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
            <Check className="w-3.5 h-3.5 text-success shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{c.name}</span>
            {c.phone && <span className="text-xs text-muted-foreground truncate">{c.phone}</span>}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onPickAnother} className="flex-1 h-11 rounded-xl">
          <Smartphone className="w-4 h-4 mr-1" /> Pick Another
        </Button>
        <Button onClick={onImport} className="flex-1 h-11 rounded-xl">
          Import {count} Contact{count !== 1 ? "s" : ""}
        </Button>
      </div>
      <button onClick={onClear} className="w-full text-xs text-muted-foreground mt-3 py-1">
        Start over
      </button>
    </div>
  );
}

function DeniedStage({ onClose, onRetry }) {
  return (
    <div className="text-center py-4">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-7 h-7 text-destructive/60" />
      </div>
      <p className="text-sm font-medium mb-1">Contact access denied</p>
      <p className="text-xs text-muted-foreground mb-5 px-2">
        BoriSend needs permission to show your contacts. You can enable it in Settings, or add contacts manually.
      </p>
      <div className="space-y-2">
        <Button onClick={onRetry} className="w-full h-11 rounded-xl">Try Again</Button>
        <PermissionSettingsButton />
        <Button variant="outline" onClick={onClose} className="w-full h-11 rounded-xl">
          Add Manually
        </Button>
      </div>
    </div>
  );
}

function PermissionSettingsButton() {
  const handleOpen = async () => {
    try {
      const PermissionService = (await import("@/services/mobile/PermissionService")).default;
      await PermissionService.openSettings();
    } catch {
      // Settings not available on this platform
    }
  };
  return (
    <Button variant="outline" onClick={handleOpen} className="w-full h-11 rounded-xl">
      Open Settings
    </Button>
  );
}

function MultiNumberStage({ contacts, choices, onChoice, onConfirm, readyCount, noPhoneCount }) {
  return (
    <div>
      <p className="text-sm font-medium mb-1">Choose a phone number</p>
      <p className="text-xs text-muted-foreground mb-4">
        Some contacts have multiple numbers. Pick which one to use.
      </p>
      <div className="space-y-3 mb-4">
        {contacts.map((c) => (
          <div key={c.display_name} className="border border-border/60 rounded-xl p-3">
            <p className="text-sm font-medium mb-2">{c.display_name}</p>
            <div className="space-y-1.5">
              {c.numbers.map((n, i) => {
                const selected = (choices[c.display_name] || c.numbers[0]?.original) === n.original;
                return (
                  <button
                    key={i}
                    onClick={() => onChoice(c.display_name, n.original)}
                    disabled={!n.valid}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
                      selected ? "bg-primary/10 border border-primary/30" : "bg-muted/50 border border-transparent"
                    } ${!n.valid ? "opacity-40 cursor-not-allowed" : "touch-manipulation"}`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selected ? "bg-primary border-primary" : "border-muted-foreground/30"
                    }`}>
                      {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span className="text-sm">{n.original}</span>
                    {!n.valid && <span className="text-xs text-muted-foreground ml-auto">Invalid</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {(readyCount > 0 || noPhoneCount > 0) && (
        <p className="text-xs text-muted-foreground mb-3">
          {readyCount > 0 && `${readyCount} contact${readyCount !== 1 ? "s" : ""} ready. `}
          {noPhoneCount > 0 && `${noPhoneCount} skipped (no phone).`}
        </p>
      )}
      <Button onClick={onConfirm} className="w-full h-11 rounded-xl">
        Import {readyCount + contacts.length} contact{readyCount + contacts.length !== 1 ? "s" : ""}
      </Button>
    </div>
  );
}

function ResultStage({ result, onClose }) {
  return (
    <div className="text-center py-4">
      <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
        <Check className="w-7 h-7 text-success" />
      </div>
      <p className="text-base font-heading font-semibold mb-3">Import complete</p>
      <div className="space-y-1.5 mb-5">
        {result.created > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-card rounded-lg">
            <span className="text-sm text-muted-foreground">Contacts added</span>
            <span className="text-sm font-semibold text-success">{result.created}</span>
          </div>
        )}
        {result.existing > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-card rounded-lg">
            <span className="text-sm text-muted-foreground">Already in BoriSend</span>
            <span className="text-sm font-semibold text-muted-foreground">{result.existing}</span>
          </div>
        )}
        {result.skipped > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-card rounded-lg">
            <span className="text-sm text-muted-foreground">Skipped (no phone)</span>
            <span className="text-sm font-semibold text-muted-foreground">{result.skipped}</span>
          </div>
        )}
      </div>
      <Button onClick={onClose} className="w-full h-11 rounded-xl">Done</Button>
    </div>
  );
}

function UnsupportedStage({ onClose }) {
  return (
    <div className="text-center py-4">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <Smartphone className="w-7 h-7 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-medium mb-1">Contact import isn't available yet</p>
      <p className="text-xs text-muted-foreground mb-5 px-2">
        Contact import isn't available on this device yet. You can still add contacts manually.
      </p>
      <Button variant="outline" onClick={onClose} className="w-full h-11 rounded-xl">
        Add Manually
      </Button>
    </div>
  );
}