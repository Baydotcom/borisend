import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Trash2, Smartphone, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { PlatformService, DeviceService, NotificationService, PermissionService } from "@/services/mobile";
import { toast } from "@/components/ui/use-toast";

export default function DeviceInfoCard() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  const [notifPerm, setNotifPerm] = useState("not_supported");
  const [smsPerm, setSmsPerm] = useState("not_applicable");
  const [pushToken, setPushToken] = useState(null);
  const [registeredDevice, setRegisteredDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unregistering, setUnregistering] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const info = await DeviceService.getDeviceInfo();
      const app = await DeviceService.getAppInfo();
      setDeviceInfo(info);
      setAppInfo(app);

      const nPerm = await PermissionService.check("notifications");
      setNotifPerm(nPerm);

      // Store release uses user-assisted SMS; SEND_SMS is not requested.
      setSmsPerm("not_applicable");

      const token = NotificationService.getDeviceToken();
      setPushToken(token);

      if (token) {
        const devices = await base44.entities.DeviceToken.filter({ token });
        if (devices && devices.length > 0) {
          setRegisteredDevice(devices[0]);
        } else {
          setRegisteredDevice(null);
        }
      } else {
        setRegisteredDevice(null);
      }
    } catch (e) {
      console.error("[DeviceInfoCard] Load failed:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRefreshRegistration = async () => {
    setRefreshing(true);
    try {
      if (PlatformService.isNative()) {
        const result = await NotificationService.registerForPush();
        if (result.success) {
          toast({ title: "Device re-registered for push" });
          await load();
        } else {
          toast({ title: result.error || "Registration failed", variant: "destructive" });
        }
      } else {
        toast({ title: "Push registration is only available on mobile apps" });
      }
    } catch (e) {
      toast({ title: "Refresh failed", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const handleReRequestPermission = async (type) => {
    const result = await PermissionService.request(type);
    if (type === "notifications") setNotifPerm(result);
    if (type === "sms") setSmsPerm(result);

    if (result === "granted") {
      toast({ title: `${type} permission granted` });
      if (type === "notifications" && PlatformService.isNative()) {
        await NotificationService.registerForPush();
        await load();
      }
    } else if (result === "denied") {
      const isPermanent = await PermissionService.isPermanentlyDenied(type);
      if (isPermanent) {
        toast({
          title: `${type} permission permanently denied`,
          description: "Please enable it in your device settings.",
          variant: "destructive"
        });
      }
    }
  };

  const handleUnregister = async () => {
    setUnregistering(true);
    try {
      await NotificationService.unregisterFromPush();
      setPushToken(null);
      setRegisteredDevice(null);
      toast({ title: "Device unregistered" });
    } catch (e) {
      toast({ title: "Unregister failed", variant: "destructive" });
    } finally {
      setUnregistering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const platform = PlatformService.getLabel();

  const PermBadge = ({ status }) => {
    if (status === "granted") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === "denied") return <XCircle className="w-4 h-4 text-red-500" />;
    return <XCircle className="w-4 h-4 text-amber-500" />;
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Device & Permissions</h3>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Device info */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Platform</span>
          <span className="font-medium">{platform}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Model</span>
          <span className="font-medium">{deviceInfo?.model || "Unknown"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">OS</span>
          <span className="font-medium">
            {deviceInfo?.platform} {deviceInfo?.osVersion}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">App version</span>
          <span className="font-medium">{appInfo?.version || "Unknown"}</span>
        </div>
      </div>

      {/* Permissions */}
      <div className="space-y-2 pt-2 border-t border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PermBadge status={notifPerm} />
            <span className="text-xs font-medium">Notifications</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground capitalize">{notifPerm}</span>
            {notifPerm !== "granted" && notifPerm !== "not_applicable" && notifPerm !== "not_supported" && (
              <button
                onClick={() => handleReRequestPermission("notifications")}
                className="text-[10px] text-primary font-medium"
              >
                Request
              </button>
            )}
          </div>
        </div>


      </div>

      {/* Push registration */}
      <div className="pt-2 border-t border-border/30 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Push registration</span>
          <span className={`text-[10px] font-medium ${pushToken ? "text-emerald-600" : "text-muted-foreground"}`}>
            {pushToken ? "Registered" : "Not registered"}
          </span>
        </div>

        {registeredDevice && (
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <p>Token: {pushToken?.slice(0, 20)}...</p>
            <p>Last seen: {registeredDevice.last_seen_at
              ? new Date(registeredDevice.last_seen_at).toLocaleString()
              : "Unknown"}</p>
            <p>Status: {registeredDevice.is_active ? "Active" : "Inactive"}</p>
          </div>
        )}

        <div className="flex gap-2">
          {PlatformService.isNative() && (
            <button
              onClick={handleRefreshRegistration}
              disabled={refreshing}
              className="flex-1 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/15 flex items-center justify-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              {pushToken ? "Re-register" : "Register"}
            </button>
          )}
          {pushToken && (
            <button
              onClick={handleUnregister}
              disabled={unregistering}
              className="flex-1 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200 flex items-center justify-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Unregister
            </button>
          )}
        </div>
      </div>
    </div>
  );
}