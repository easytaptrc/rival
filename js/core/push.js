// Registro opcional de token FCM para notificaciones push con la app cerrada.
// Requiere VAPID_KEY en js/firebase.js y desplegar functions/ (plan Blaze).
import { app, db, VAPID_KEY, doc, setDoc, serverTimestamp } from "../firebase.js";

export async function registerPush(profile) {
  if (!VAPID_KEY || !("serviceWorker" in navigator) || Notification.permission !== "granted") return false;
  try {
    const { getMessaging, getToken, isSupported } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
    if (!(await isSupported())) return false;
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return false;
    await setDoc(doc(db, "pushTokens", token), { uid: profile.uid, role: profile.role, ua: navigator.userAgent.slice(0, 160), at: serverTimestamp() });
    return true;
  } catch (e) {
    console.warn("push", e);
    return false;
  }
}
