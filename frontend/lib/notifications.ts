export type IrrigationAlert = {
  id: string;
  severity: "high" | "medium" | "info";
  title: string;
  message: string;
};

export function buildAlerts(input: {
  moisture?: number | null;
  rainfall?: number | null;
  need?: string;
  required?: boolean;
  sensorError?: string | null;
}): IrrigationAlert[] {
  const alerts: IrrigationAlert[] = [];
  if (input.sensorError) {
    alerts.push({ id: "sensor", severity: "high", title: "Sensor data missing", message: input.sensorError });
  }
  if (input.moisture != null && input.moisture < 25) {
    alerts.push({
      id: "dry",
      severity: "high",
      title: "Low soil moisture",
      message: `Soil moisture is ${input.moisture.toFixed(1)}%. Immediate irrigation is recommended.`,
    });
  }
  if ((input.rainfall ?? 0) >= 10) {
    alerts.push({
      id: "rain",
      severity: "medium",
      title: "Rainfall detected",
      message: "Recent rainfall may reduce the need for irrigation.",
    });
  }
  if (input.need === "High" || input.required) {
    alerts.push({
      id: "irrigation",
      severity: "info",
      title: "Irrigation scheduled",
      message: "Review today's AI recommendation and time slot.",
    });
  }
  if (input.moisture != null && input.moisture >= 70) {
    alerts.push({
      id: "wet",
      severity: "medium",
      title: "Over-watering risk",
      message: "Soil moisture is already high. Irrigation prevented.",
    });
  }
  return alerts;
}

/**
 * Display a native browser notification using Service Worker or Notification API.
 */
export async function showLocalNotification(
  title: string,
  body: string,
  icon = "/icons/icon-192.png"
): Promise<{ success: boolean; message: string }> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { success: false, message: "Browser notifications are not supported by this browser." };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }

  if (permission !== "granted") {
    return { success: false, message: "Notification permission was denied in your browser settings." };
  }

  // 1. Try Service Worker showNotification (Best for Chrome, Android & PWAs)
  if ("serviceWorker" in navigator) {
    try {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Service worker unavailable")), 3000)),
      ]);
      if (registration && "showNotification" in registration) {
        await registration.showNotification(title, {
          body,
          icon,
          badge: icon,
          data: { url: "/" },
          tag: "smart-irrigation-alert",
        });
        return { success: true, message: "Notification displayed via service worker." };
      }
    } catch (swErr) {
      console.warn("ServiceWorker showNotification failed, using fallback:", swErr);
    }
  }

  // 2. Fallback to standard Notification constructor (Desktop browsers)
  try {
    const notif = new Notification(title, { body, icon });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    return { success: true, message: "Notification displayed." };
  } catch (err) {
    console.error("Local Notification constructor error:", err);
    return { success: false, message: err instanceof Error ? err.message : "Could not display notification." };
  }
}

export async function requestBrowserNotifications(alerts: IrrigationAlert[]): Promise<string> {
  if (!alerts.length) {
    return "There are no current alerts to display.";
  }
  const results = await Promise.all(alerts.map((alert) => showLocalNotification(alert.title, alert.message)));
  const delivered = results.filter((result) => result.success).length;
  return delivered
    ? `${delivered} of ${alerts.length} alert${alerts.length === 1 ? "" : "s"} sent to this browser.`
    : results[0]?.message || "Could not display a browser notification.";
}
