// =============================================================
// firebase.js
// Local: raiz do projeto (mesma pasta do index.html)
//
// Responsabilidade: inicializar o Firebase uma única vez e
// exportar as instâncias de Auth, Firestore e Storage. Nenhum
// outro arquivo deve chamar initializeApp() além deste.
// =============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// >>> SUBSTITUA pelos dados do SEU projeto Firebase <<<
// Firebase Console → Configurações do projeto → Seus apps → SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyAyP-Hxwbc9WxjSs0GiAkH9UtsEtckWcpk",
  authDomain: "vigilante-painel.firebaseapp.com",
  databaseURL: "https://vigilante-painel-default-rtdb.firebaseio.com",
  projectId: "vigilante-painel",
  storageBucket: "vigilante-painel.firebasestorage.app",
  messagingSenderId: "679586336318",
  appId: "1:679586336318:web:2ef2aedce5e42b49c4cb6f"
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// Mantém o usuário logado entre sessões do navegador (persistência de login).
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Erro ao configurar persistência de autenticação:", err);
});
