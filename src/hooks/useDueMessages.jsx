import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { SMSService } from "@/services/mobile";

export function useDueMessages() {
  const [dueMessages, setDueMessages] = useState([]);
  const [deliveryMode, setDeliveryMode] = useState("manual");
  const [sending, setSending] = useState(false);

  const checkDue = useCallback(async () => {
    try {
      const response = await base44.functions.invoke("getPendingMessages", {});
      const msgs = response.data.messages || [];
      setDueMessages(msgs);
      // Store builds are user-assisted at launch. Keep server state for display,
      // but never trigger unattended SMS sending from the client.
      setDeliveryMode(response.data.delivery_mode || "manual");
    } catch (e) {
      console.error("[useDueMessages] Failed to fetch due messages:", e.message);
    }
  }, []);

  useEffect(() => {
    checkDue();
    const interval = setInterval(checkDue, 60000);
    return () => clearInterval(interval);
  }, [checkDue]);

  const sendNow = useCallback(async (message) => {
    setSending(true);
    try {
      await SMSService.send(message.recipient_phone, message.content, { mode: "manual" });
      const nowIso = new Date().toISOString();
      await base44.entities.Message.update(message.id, { composer_opened_at: nowIso });
      setDueMessages(prev => prev.map(m => m.id === message.id ? { ...m, composer_opened_at: nowIso } : m));
      return { composerOpened: true };
    } finally {
      setSending(false);
    }
  }, []);

  const confirmSent = useCallback(async (message) => {
    setSending(true);
    try {
      await base44.functions.invoke("markMessageSent", { message_id: message.id, status: "sent" });
      setDueMessages(prev => prev.filter(m => m.id !== message.id));
      return { sent: true };
    } finally {
      setSending(false);
    }
  }, []);

  return { dueMessages, deliveryMode, sending, sendNow, confirmSent, checkDue };
}