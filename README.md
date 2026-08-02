# Vigilante — Painel Pessoal (com Firebase)

Painel pessoal de produtividade — financeiro, reserva financeira, contas,
hábitos, notas e treinos — com tema escuro (preto, grafite e dourado),
autenticação e banco de dados via Firebase.

## Estrutura de arquivos

Todos os arquivos abaixo devem ficar **na mesma pasta**, na raiz do projeto:

```
/index.html      → estrutura da página (login/cadastro/recuperação + dashboard)
/style.css        → todo o visual (tema escuro, cores, glassmorphism)
/firebase.js      → inicializa o Firebase (Auth + Firestore + Storage)
/auth.js          → cadastro, login, logout, recuperação de senha
/database.js      → toda a leitura/escrita no Firestore
/storage.js       → upload da foto de perfil (validação, redimensionamento e envio ao Storage)
/icons.js         → conjunto próprio de ícones SVG usado em toda a interface
/app.js           → lógica da interface — liga tudo o que está acima
```

## Passo 1 — Configurar o Firebase

Abra `firebase.js` e substitua o objeto `firebaseConfig` pelos dados do seu
projeto (Firebase Console → Configurações do projeto → Seus apps → SDK
setup and configuration).

## Passo 2 — Ativar Authentication

Firebase Console → **Authentication → Sign-in method** → ative **E-mail/senha**.

## Passo 3 — Criar o Firestore Database

Firebase Console → **Firestore Database → Criar banco de dados** (modo produção).
Em **Regras**, cole:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{collection}/{docId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

## Passo 4 — Ativar o Firebase Storage (foto de perfil)

Firebase Console → **Storage → Começar**. Em **Regras**, cole:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

## Passo 5 — Publicar

`app.js` é um módulo ES (`<script type="module">`), então precisa ser servido
por HTTP(S) — não funciona abrindo o arquivo direto (`file://`). Funciona
normalmente em **GitHub Pages**, **Firebase Hosting**, ou um servidor local
(ex: extensão "Live Server" do VS Code) para testar antes de publicar.

## Estrutura de dados no Firestore

```
users/{uid}                   → perfil (nome, foto, cor de destaque, animações)
users/{uid}/transactions/{id} → lançamentos financeiros
users/{uid}/reserves/{id}     → metas da reserva financeira
users/{uid}/bills/{id}        → contas fixas
users/{uid}/habits/{id}       → hábitos
users/{uid}/notes/{id}        → notas
users/{uid}/workouts/{id}     → registros de treino
```

Cada usuário só enxerga e só grava dentro do seu próprio `users/{uid}` —
garantido tanto pelo código (`app.js` sempre usa o `uid` do usuário logado)
quanto pelas regras do Firestore/Storage acima.

## Padrão de atualização otimista

Toda ação de escrita (adicionar/editar/excluir transações, hábitos, notas,
contas, metas, treinos, e alterações de perfil) atualiza a tela **na hora**,
sem esperar o Firestore responder. A gravação acontece em segundo plano; se
falhar, a alteração é desfeita automaticamente e um aviso aparece. Isso deixa
a interface sempre fluida, mesmo com conexão lenta.

## Subindo atualizações para o GitHub

```bash
git add .
git commit -m "Descrição do que mudou"
git push
```
