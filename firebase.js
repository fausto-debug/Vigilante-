// =============================================================
// firebase.js
// Local: raiz do projeto (mesma pasta do index.html)
//
// Responsabilidade: inicializar o Firebase e exportar as instâncias
// de Auth, Firestore e Storage para serem usadas por auth.js, database.js
// e storage.js. Nenhum outro arquivo deve chamar initializeApp() além deste.
// =============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// >>> SUBSTITUA os valores abaixo pela configuração do SEU projeto <<<
// Você encontra esses dados em: Firebase Console > Configurações do projeto
// (ícone de engrenagem) > Seus apps > SDK setup and configuration.
const firebaseConfig = {
  apiKey: "AIzaSyDSSDEJ0Nu1-QBV_fKnuXQ7q8ViPzK8QJk",
  authDomain: "vigilante-8f45e.firebaseapp.com",
  projectId: "vigilante-8f45e",
  storageBucket: "vigilante-8f45e.firebasestorage.app",
  messagingSenderId: "458897784896",
  appId: "1:458897784896:web:56bb8c8884c78c9a2a9fa5"
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// Persistência local: o usuário continua logado mesmo depois de
// fechar o navegador (requisito de "persistência de login").
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Erro ao configurar persistência de autenticação:", err);
});
