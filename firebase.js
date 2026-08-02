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
  apiKey: "COLE_AQUI_SUA_API_KEY",
  authDomain: "COLE_AQUI_SEU_PROJETO.firebaseapp.com",
  projectId: "COLE_AQUI_SEU_PROJETO",
  storageBucket: "COLE_AQUI_SEU_PROJETO.appspot.com",
  messagingSenderId: "COLE_AQUI_SEU_SENDER_ID",
  appId: "COLE_AQUI_SEU_APP_ID",
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// Mantém o usuário logado entre sessões do navegador (persistência de login).
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Erro ao configurar persistência de autenticação:", err);
});
