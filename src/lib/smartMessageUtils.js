/**
 * RC18.1 — Smart Message display utilities.
 * User-friendly trigger labels and summaries (§13 — no enum names exposed).
 * Self-contained — does not import from base44/shared (frontend-safe).
 */

const TRIGGER_INFO = {
  time: { display_name: "Time", description: "Fires at a specific time of day" },
  date: { display_name: "Specific Date", description: "Fires once on a specific date" },
  recurring_date: { display_name: "Recurring Schedule", description: "Fires on a recurring pattern" },
  manual_event: { display_name: "Manual Event", description: "User-initiated trigger" },
  location_arrival: { display_name: "Location Arrival", description: "Fires when arriving at a place" },
  location_departure: { display_name: "Location Departure", description: "Fires when leaving a place" },
};

export function formatTriggerDisplay(triggerType, triggerConfig) {
  const cfg = triggerConfig || {};
  const info = TRIGGER_INFO[triggerType];

  switch (triggerType) {
    case "time": {
      const time = cfg.time_of_day || "—";
      const days = cfg.recurring_days;
      if (!days || days.length === 0) return `Daily at ${time}`;
      if (days.length === 7) return `Every day at ${time}`;
      if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return `Weekdays at ${time}`;
      if (days.length === 2 && days.includes(0) && days.includes(6)) return `Weekends at ${time}`;
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return `${days.map(d => dayNames[d] || "").filter(Boolean).join(", ")} at ${time}`;
    }
    case "date": {
      const date = cfg.specific_date;
      const time = cfg.time_of_day || "09:00";
      if (!date) return "One-time date";
      const d = new Date(date + "T" + time);
      return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    }
    case "recurring_date": {
      const pattern = cfg.recurring_pattern || "weekly";
      const time = cfg.time_of_day || "09:00";
      if (pattern === "weekly") {
        const days = cfg.recurring_days;
        if (!days || days.length === 0) return `Daily at ${time}`;
        if (days.length === 7) return `Every day at ${time}`;
        if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return `Weekdays at ${time}`;
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return `${days.map(d => dayNames[d]).join(", ")} at ${time}`;
      }
      if (pattern === "monthly") {
        return `Monthly on day ${cfg.recurring_day_of_month || 1} at ${time}`;
      }
      if (pattern === "annual") {
        const month = cfg.recurring_month || 1;
        const day = cfg.recurring_day_of_month || 1;
        const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `Annually on ${monthNames[month]} ${day}`;
      }
      return "Recurring schedule";
    }
    case "manual_event":
      return cfg.manual_event_label ? `Manual: ${cfg.manual_event_label}` : "Manual event";
    case "location_arrival":
      return cfg.location_place_name ? `Arrive at ${cfg.location_place_name}` : "Location arrival";
    case "location_departure":
      return cfg.location_place_name ? `Leave ${cfg.location_place_name}` : "Location departure";
    default:
      return info?.display_name || "Unknown trigger";
  }
}

export function getTriggerIcon(triggerType) {
  const icons = {
    time: "Clock",
    date: "Calendar",
    recurring_date: "Repeat",
    manual_event: "Zap",
    location_arrival: "MapPin",
    location_departure: "MapPin",
  };
  return icons[triggerType] || "Zap";
}