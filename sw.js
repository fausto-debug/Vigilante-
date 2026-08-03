// =============================================================
// sw.js — Service Worker
// Local: raiz do projeto (mesma pasta do index.html)
//
// Responsabilidade: permitir que o navegador trate o Vigilant como
// um app instalável (PWA), e fazer o "esqueleto" do app (HTML, CSS,
// JS, ícones) carregar instantaneamente — inclusive offline.
//
// REGRA MAIS IMPORTANTE DESTE ARQUIVO: nunca, em hipótese nenhuma,
// interceptar chamadas ao Firebase (Auth, Firestore, Storage). Essas
// chamadas precisam SEMPRE ir direto pro servidor — são dados ao
// vivo (saldo, hábitos, sessão de login). Cachear isso faria o app
// mostrar informação desatualizada ou, pior, misturar dados entre
// contas. Por isso a lista de bloqueio abaixo existe.
//
// IMPORTANTE PARA QUEM FOR ATUALIZAR O APP NO FUTURO:
// Sempre que o conteúdo de qualquer arquivo listado em APP_SHELL_FILES
// mudar (novo index.html, novo app.js, novo style.css...), aumente o
// número em CACHE_VERSION. Isso força os navegadores dos usuários a
// descartar a versão antiga em cache e buscar a nova. Esquecer desse
// passo é a causa nº 1 de "atualizei o código mas o app continua
// mostrando a versão velha".
// =============================================================

const CACHE_VERSION = "v1";
const CACHE_NAME = `vigilant-shell-${CACHE_VERSION}`;

// Arquivos que formam o "esqueleto" do app — tudo que é necessário
// pra desenhar a tela, mesmo sem internet.
const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./firebase.js",
  "./auth.js",
  "./database.js",
  "./storage.js",
  "./icons.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

// Domínios do Firebase que NUNCA podem ser interceptados/cacheados —
// são dados ao vivo (autenticação, banco de dados, arquivos do usuário).
const NEVER_CACHE_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebasestorage.googleapis.com",
  "firebaseinstallations.googleapis.com",
];

/* ---------------- Instalação: baixa e guarda o esqueleto do app ---------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting(); // ativa a nova versão assim que possível
});

/* ---------------- Ativação: apaga versões antigas do cache ---------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("vigilant-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ---------------- Busca: decide o que passa direto e o que usa cache ---------------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Só interceptamos pedidos GET. Qualquer escrita (POST/PUT/DELETE —
  // é assim que login, salvar dados etc. funcionam) passa direto, sempre.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Firebase (Auth/Firestore/Storage): nunca intercepta. Deixa o
  // navegador cuidar normalmente, como se este arquivo nem existisse.
  if (NEVER_CACHE_HOSTS.includes(url.hostname)) return;

  // Para todo o resto (arquivos do próprio app, fontes do Google,
  // SDK do Firebase no gstatic.com): cache primeiro, com atualização
  // em segundo plano — carrega rápido, e sempre busca uma versão
  // nova pra da próxima vez.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached); // sem internet: usa o que tiver em cache

      return cached || network;
    })
  );
});
