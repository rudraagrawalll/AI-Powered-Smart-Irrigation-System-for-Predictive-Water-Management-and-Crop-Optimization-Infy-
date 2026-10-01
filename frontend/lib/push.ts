import { EXPRESS_API } from "@/lib/api";
function decodeBase64Url(value: string): Uint8Array {
  const padded = (value + "===".slice((value.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
export async function enableWebPush(): Promise<string> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Web Push is not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID keys in the backend environment.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Web Push is not supported by this browser.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Browser notification permission was not granted.");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(key) as BufferSource });
  const response = await fetch(`${EXPRESS_API}/api/push/subscribe`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not save your push subscription.");
  return "Browser push notifications are enabled for this device.";
}
