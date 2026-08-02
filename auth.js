// =============================================================
// auth.js
// Local: raiz do projeto (mesma pasta do index.html)
//
// Responsabilidade: toda a lógica de autenticação e o observador
// global de sessão que o app.js usa para decidir entre mostrar a
// tela de login ou o Dashboard (proteção de rotas).
// =============================================================

import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ensureUserProfile } from "./database.js";

export async function registerUser(name, email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(credential.user.uid, { name, email });
  return credential.user;
}

export async function loginUser(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export function logoutUser() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// Observa mudanças de sessão em tempo real (login/logout). O app.js usa
// isso para mostrar o Dashboard só quando há um usuário autenticado, e
// para manter a sessão entre recarregamentos de página.
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// Traduz códigos de erro do Firebase para mensagens em português.
export function traduzErroFirebase(err) {
  const code = err && err.code ? err.code : "";
  const messages = {
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente em instantes.",
    "auth/missing-password": "Informe uma senha.",
  };
  return messages[code] || "Ocorreu um erro. Tente novamente.";
}
