// Configuración e inicialización de Firebase (compartida por index, admin e insumos).
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, setPersistence, browserLocalPersistence, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, limit,
  getDocs, onSnapshot, serverTimestamp, runTransaction, writeBatch, increment, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCQQO92Ym4x2XU4yrfKnOae_1RzlTWTqeI",
  authDomain: "ssas-easygym.firebaseapp.com",
  projectId: "ssas-easygym",
  storageBucket: "ssas-easygym.firebasestorage.app",
  messagingSenderId: "640610066792",
  appId: "1:640610066792:web:38832367eeebf2e91cf6dd",
  measurementId: "G-5LEC5PSVVQ",
};

// Opcional: clave VAPID de Cloud Messaging (Consola > Configuración del proyecto > Cloud Messaging)
// para recibir notificaciones push con la app cerrada. Vacía = notificaciones solo con la app abierta.
export const VAPID_KEY = "";

// Dominio interno: el usuario escribe "maria" y se autentica como maria@usuarios.rival.app
export const USER_DOMAIN = "usuarios.rival.app";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Pruebas locales con Firebase Emulator: abre http://localhost:5500/admin.html?emu (solo en localhost).
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const qs = new URLSearchParams(location.search);
if (isLocal && qs.has("emu")) localStorage.setItem("rival.emu", qs.get("emu") === "0" ? "" : "1");
export const USING_EMULATOR = isLocal && !!localStorage.getItem("rival.emu");

let _db;
try {
  _db = initializeFirestore(app, USING_EMULATOR ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch {
  _db = initializeFirestore(app, {});
}
export const db = _db;
if (USING_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.info("RIVAL · usando Firebase Emulator");
}

/** Instancia de Auth aislada para crear cuentas sin cerrar la sesión actual (alta de personal). */
export async function secondaryAuth() {
  const { deleteApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const sec = initializeApp(firebaseConfig, `sec-${Date.now()}`);
  const a = getAuth(sec);
  if (USING_EMULATOR) connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
  return { auth: a, dispose: () => deleteApp(sec).catch(() => {}) };
}

export {
  getApp, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, limit,
  getDocs, onSnapshot, serverTimestamp, runTransaction, writeBatch, increment, Timestamp,
};
