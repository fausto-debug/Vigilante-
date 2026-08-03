// =============================================================
// app.js
// Local: raiz do projeto (mesma pasta do index.html)
//
// Ponto de entrada da aplicação. Cuida de:
//  - alternância entre telas de autenticação e o Dashboard (proteção de rotas)
//  - toda a lógica de UI (CRUD de cada módulo, gráficos, configurações)
//  - leitura/gravação no Firestore através de database.js
//
// Padrão usado em TODA ação de escrita (transações, hábitos, notas,
// contas, metas, treinos, perfil): a tela é atualizada imediatamente
// (otimista) e a gravação no Firestore acontece em segundo plano. Se a
// gravação falhar, a alteração é desfeita e um aviso é mostrado. Isso
// evita qualquer sensação de espera — nada trava esperando o servidor.
// =============================================================

import { auth } from "./firebase.js";
import {
  registerUser,
  loginUser,
  logoutUser,
  resetPassword,
  watchAuthState,
  traduzErroFirebase,
} from "./auth.js";
import {
  watchUserProfile,
  updateUserProfile,
  watchCollection,
  addItem,
  updateItem,
  deleteItem,
} from "./database.js";
import { uploadProfilePhoto, PhotoValidationError } from "./storage.js";
import { icon } from "./icons.js";

/* =====================================================================
   1. ESTADO — espelha o Firestore em memória, populado pelos listeners
   em tempo real. Escritas nunca mudam este estado diretamente antes de
   ir ao Firestore (exceto atualizações otimistas, sempre revertidas em
   caso de erro).
   ===================================================================== */
let currentUid = null;
let profile = { name: "Usuário", photo: "", accent: "gold", animations: true, plan: "free" };
let transactions = [];
let reserves = [];
let bills = [];
let habits = [];
let notes = [];
let workoutLogs = [];
let unsubscribers = [];

const ACCENTS = { gold: "#F5C518", blue: "#3B82F6", red: "#EF4444", green: "#10B981", purple: "#8B5CF6" };
const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MUSCLE_GROUPS = ["Peito", "Costas", "Ombro", "Bíceps", "Tríceps", "Pernas", "Cardio"];
const FIN_CATEGORIES = {
  receita: ["Salário", "Freelance", "Investimentos", "Outros"],
  despesa: ["Moradia", "Alimentação", "Transporte", "Lazer", "Saúde", "Educação", "Outros"],
};

/* =====================================================================
   2. UTILITÁRIOS
   ===================================================================== */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function fmtMoney(value) {
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function daysBetween(iso) {
  const today = new Date(todayISO());
  const target = new Date(iso);
  return Math.ceil((target - today) / 86400000);
}
function esc(value) {
  return (value ?? "").toString()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function byId(id) {
  return document.getElementById(id);
}
// Pergunta simples: o usuário está no plano pago? Usada em qualquer
// lugar que precise liberar ou travar um recurso premium.
function isPremium() {
  return profile.plan === "premium";
}

function toast(message, type = "default") {
  const wrap = byId("toast-wrap");
  const el = document.createElement("div");
  el.className = "toast " + (type === "success" ? "success" : type === "danger" ? "danger" : "");
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

// Roda uma escrita no Firestore em segundo plano: aplica a mudança local
// primeiro (já feita pelo chamador), tenta gravar, e reverte + avisa se falhar.
function backgroundWrite(writePromise, onError) {
  writePromise.catch((err) => {
    console.error(err);
    if (onError) onError();
    toast("Não foi possível salvar. Verifique sua conexão.", "danger");
  });
}

async function withButtonLoading(button, task) {
  if (!button) return task();
  button.classList.add("is-loading");
  button.disabled = true;
  try {
    await task();
  } finally {
    button.classList.remove("is-loading");
    button.disabled = false;
  }
}

/* =====================================================================
   3. AUTENTICAÇÃO — troca de telas e proteção de rotas
   ===================================================================== */
function showScreen(id) {
  document.querySelectorAll(".auth-screen, #appRoot").forEach((el) => el.classList.remove("active"));
  byId(id).classList.add("active");
}

byId("goSignup")?.addEventListener("click", () => showScreen("screenSignup"));
byId("goLoginFromSignup")?.addEventListener("click", () => showScreen("screenLogin"));
byId("goForgot")?.addEventListener("click", () => showScreen("screenForgot"));
byId("goLoginFromForgot")?.addEventListener("click", () => showScreen("screenLogin"));

byId("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = byId("loginError");
  errEl.classList.remove("show");
  const email = byId("loginEmail").value.trim();
  const password = byId("loginPassword").value;
  const btn = e.target.querySelector("button[type=submit]");
  await withButtonLoading(btn, async () => {
    try {
      await loginUser(email, password);
      // watchAuthState() cuida de mostrar o dashboard
    } catch (err) {
      errEl.textContent = traduzErroFirebase(err);
      errEl.classList.add("show");
    }
  });
});

byId("signupForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = byId("signupError");
  errEl.classList.remove("show");
  const name = byId("signupName").value.trim();
  const email = byId("signupEmail").value.trim();
  const password = byId("signupPassword").value;
  const confirm = byId("signupConfirm").value;
  if (password !== confirm) {
    errEl.textContent = "As senhas não coincidem.";
    errEl.classList.add("show");
    return;
  }
  const btn = e.target.querySelector("button[type=submit]");
  await withButtonLoading(btn, async () => {
    try {
      await registerUser(name, email, password);
    } catch (err) {
      errEl.textContent = traduzErroFirebase(err);
      errEl.classList.add("show");
    }
  });
});

byId("forgotForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = byId("forgotError");
  const okEl = byId("forgotSuccess");
  errEl.classList.remove("show");
  okEl.classList.remove("show");
  const email = byId("forgotEmail").value.trim();
  const btn = e.target.querySelector("button[type=submit]");
  await withButtonLoading(btn, async () => {
    try {
      await resetPassword(email);
      okEl.textContent = "Enviamos um link de redefinição de senha para o seu e-mail.";
      okEl.classList.add("show");
    } catch (err) {
      errEl.textContent = traduzErroFirebase(err);
      errEl.classList.add("show");
    }
  });
});

// Reseta a UI da sidebar para o estado padrão (fecha menu mobile, volta
// para a view Dashboard) — evita qualquer estado "preso" após o logout.
function resetShellUI() {
  byId("sidebar")?.classList.remove("mobile-open");
  byId("sidebarBackdrop")?.classList.remove("show");
  document.querySelectorAll(".nav-item").forEach((b) => {
    b.classList.remove("active");
    b.removeAttribute("aria-current");
  });
  const dashBtn = document.querySelector('.nav-item[data-view="dashboard"]');
  if (dashBtn) {
    dashBtn.classList.add("active");
    dashBtn.setAttribute("aria-current", "page");
  }
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  byId("view-dashboard")?.classList.add("active");
  closeModal();
}

function logout() {
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];
  logoutUser();
}

function showRouteTransition(on) {
  byId("routeTransition")?.classList.toggle("show", on);
}

let firstAuthCheck = true;
watchAuthState((user) => {
  if (!firstAuthCheck) showRouteTransition(true);

  if (user) {
    currentUid = user.uid;
    showScreen("appRoot");
    subscribeToAllData(user.uid);
  } else {
    unsubscribers.forEach((unsub) => unsub());
    unsubscribers = [];
    currentUid = null;
    transactions = [];
    reserves = [];
    bills = [];
    habits = [];
    notes = [];
    workoutLogs = [];
    profile = { name: "Usuário", photo: "", accent: "gold", animations: true, plan: "free" };
    resetShellUI();
    showScreen("screenLogin");
  }

  byId("loadingScreen").classList.add("hidden");
  firstAuthCheck = false;
  setTimeout(() => showRouteTransition(false), 220);
});

function subscribeToAllData(uid) {
  unsubscribers.push(
    watchUserProfile(uid, (p) => {
      if (!p) return;
      profile = p;
      applyAccent();
      document.body.dataset.anim = profile.animations ? "on" : "off";
      renderAll();
    })
  );
  unsubscribers.push(watchCollection(uid, "transactions", (items) => { transactions = items; renderAll(); }));
  unsubscribers.push(watchCollection(uid, "reserves", (items) => { reserves = items; renderAll(); }));
  unsubscribers.push(watchCollection(uid, "bills", (items) => { bills = items; renderAll(); }));
  unsubscribers.push(watchCollection(uid, "habits", (items) => { habits = items; renderAll(); }));
  unsubscribers.push(watchCollection(uid, "notes", (items) => { notes = items; renderAll(); }));
  unsubscribers.push(watchCollection(uid, "workouts", (items) => { workoutLogs = items; renderAll(); }));
}

/* =====================================================================
   4. NAVEGAÇÃO (sidebar, menu mobile, colapsar)
   ===================================================================== */
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => {
      b.classList.remove("active");
      b.removeAttribute("aria-current");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-current", "page");

    const view = btn.dataset.view;
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    byId("view-" + view).classList.add("active");

    closeMobileSidebar();
    renderAll();
  });
});

byId("collapseBtn")?.addEventListener("click", () => {
  const sidebar = byId("sidebar");
  const btn = byId("collapseBtn");
  sidebar.classList.toggle("collapsed");
  const collapsed = sidebar.classList.contains("collapsed");
  btn.setAttribute("aria-expanded", String(!collapsed));
});

function openMobileSidebar() {
  byId("sidebar")?.classList.add("mobile-open");
  byId("sidebarBackdrop")?.classList.add("show");
}
function closeMobileSidebar() {
  byId("sidebar")?.classList.remove("mobile-open");
  byId("sidebarBackdrop")?.classList.remove("show");
}
byId("mobileMenuBtn")?.addEventListener("click", () => {
  const sidebar = byId("sidebar");
  if (!sidebar) return;
  sidebar.classList.contains("mobile-open") ? closeMobileSidebar() : openMobileSidebar();
});
byId("sidebarBackdrop")?.addEventListener("click", closeMobileSidebar);
byId("exportQuickBtn")?.addEventListener("click", exportData);
byId("logoutBtn")?.addEventListener("click", logout);

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeMobileSidebar();
  if (byId("modalBackdrop").classList.contains("open")) closeModal();
});

window.addEventListener("resize", () => {
  clearTimeout(window._resizeTimer);
  window._resizeTimer = setTimeout(renderAll, 150);
});

/* =====================================================================
   5. RELÓGIO / SAUDAÇÃO
   ===================================================================== */
function updateClock() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = (profile.name || "Usuário").split(" ")[0];
  byId("greetingText").textContent = `${greeting}, ${firstName}`;

  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  byId("datetimeText").textContent = `${dateStr.charAt(0).toUpperCase()}${dateStr.slice(1)} · ${timeStr}`;
}
setInterval(updateClock, 30000);

/* =====================================================================
   6. MODAL GENÉRICO
   ===================================================================== */
let lastFocusedBeforeModal = null;

function openModal(html) {
  lastFocusedBeforeModal = document.activeElement;
  byId("modalBox").innerHTML = html;
  byId("modalBackdrop").classList.add("open");
  const firstField = document.querySelector("#modalBox input, #modalBox select, #modalBox textarea");
  if (firstField) setTimeout(() => firstField.focus(), 50);
}
function closeModal() {
  byId("modalBackdrop").classList.remove("open");
  if (lastFocusedBeforeModal?.focus) lastFocusedBeforeModal.focus();
}
byId("modalBackdrop")?.addEventListener("click", (e) => {
  if (e.target.id === "modalBackdrop") closeModal();
});

// Modal reutilizável, mostrado sempre que o plano gratuito bloquear algo.
// "feature" é só o nome pra aparecer na mensagem; "reason" explica o limite.
function openUpgradeModal(feature, reason) {
  openModal(`
    <div class="modal-head"><h3>Recurso do plano Premium</h3><button class="btn-ghost" onclick="closeModal()">${icon("x", 14)}</button></div>
    <p style="color:var(--text-dim); font-size:13.5px; line-height:1.6;">${esc(reason)}</p>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Agora não</button>
      <button class="btn btn-accent" onclick="window.goToUpgrade()">Fazer upgrade</button>
    </div>
  `);
}
function goToUpgrade() {
  closeModal();
  // Por enquanto só avisa — no próximo passo isso vai abrir o checkout do Asaas.
  toast("Em breve: checkout de assinatura", "default");
}

/* =====================================================================
   7. FINANCEIRO — transações
   ===================================================================== */
function openTxModal(type, editId) {
  const editing = editId ? transactions.find((t) => t.id === editId) : null;
  const txType = editing ? editing.type : type;
  const categories = FIN_CATEGORIES[txType];
  openModal(`
    <div class="modal-head"><h3>${editing ? "Editar" : "Adicionar"} ${txType === "receita" ? "receita" : "despesa"}</h3><button class="btn-ghost" onclick="closeModal()">${icon("x", 14)}</button></div>
    <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" id="txValor" value="${editing ? editing.amount : ""}" placeholder="0,00"></div>
    <div class="field"><label>Categoria</label><select id="txCategoria">${categories.map((c) => `<option ${editing && editing.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    <div class="field"><label>Data</label><input type="date" id="txData" value="${editing ? editing.date : todayISO()}"></div>
    <div class="field"><label>Observações</label><textarea id="txObs" placeholder="Opcional">${editing ? esc(editing.note || "") : ""}</textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-accent" onclick="window.saveTx('${txType}','${editId || ""}')">Salvar</button>
    </div>
  `);
}
function saveTx(type, editId) {
  const amount = parseFloat(byId("txValor").value);
  if (!amount || amount <= 0) { toast("Informe um valor válido", "danger"); return; }
  const data = {
    type,
    amount,
    category: byId("txCategoria").value,
    date: byId("txData").value || todayISO(),
    note: byId("txObs").value,
  };
  closeModal();
  toast("Lançamento salvo", "success");
  backgroundWrite(editId ? updateItem(currentUid, "transactions", editId, data) : addItem(currentUid, "transactions", data));
}
function deleteTx(id) {
  backgroundWrite(deleteItem(currentUid, "transactions", id));
}

function renderFinance() {
  const totalIn = transactions.filter((t) => t.type === "receita").reduce((sum, t) => sum + t.amount, 0);
  const totalOut = transactions.filter((t) => t.type === "despesa").reduce((sum, t) => sum + t.amount, 0);
  byId("finTotalIn").textContent = fmtMoney(totalIn);
  byId("finTotalOut").textContent = fmtMoney(totalOut);
  byId("finBalance").textContent = fmtMoney(totalIn - totalOut);
  byId("txCount").textContent = `${transactions.length} lançamento(s)`;

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  byId("txList").innerHTML = sorted.length
    ? sorted.map((t) => `
      <div class="row-item">
        <div class="ic" style="background:${t.type === "receita" ? "var(--success-dim)" : "var(--danger-dim)"}; color:${t.type === "receita" ? "var(--success)" : "var(--danger)"}">${t.type === "receita" ? icon("arrowUp", 15) : icon("arrowDown", 15)}</div>
        <div class="info"><div class="t1">${esc(t.category)}</div><div class="t2">${fmtDate(t.date)}${t.note ? " · " + esc(t.note) : ""}</div></div>
        <div class="amount ${t.type === "receita" ? "in" : "out"}">${t.type === "receita" ? "+" : "-"} ${fmtMoney(t.amount)}</div>
        <div class="row-actions">
          <button class="btn-ghost" title="Editar" onclick="window.openTxModal('${t.type}','${t.id}')">${icon("pencil", 14)}</button>
          <button class="btn-danger-ghost" title="Excluir" onclick="window.deleteTx('${t.id}')">${icon("trash", 14)}</button>
        </div>
      </div>`).join("")
    : `<div class="empty"><span class="ic">${icon("wallet", 30)}</span>Nenhum lançamento ainda</div>`;

  drawFinanceMonthlyChart();
}

/* =====================================================================
   8. RESERVA FINANCEIRA — metas
   ===================================================================== */
function openGoalModal(editId) {
  // Trava do plano gratuito: só deixa criar uma meta NOVA (editId vazio)
  // se o usuário já não tiver atingido o limite do plano free.
  const isNewGoal = !editId;
  if (isNewGoal && !isPremium() && reserves.length >= 1) {
    openUpgradeModal("Reserva Financeira", "O plano gratuito permite 1 meta. Faça upgrade para criar metas ilimitadas.");
    return;
  }
  const editing = editId ? reserves.find((g) => g.id === editId) : null;
  openModal(`
    <div class="modal-head"><h3>${editing ? "Editar" : "Nova"} meta</h3><button class="btn-ghost" onclick="closeModal()">${icon("x", 14)}</button></div>
    <div class="field"><label>Nome da meta</label><input type="text" id="goalNome" value="${editing ? esc(editing.name) : ""}" placeholder="Ex: Reserva de emergência"></div>
    <div class="field-row">
      <div class="field"><label>Valor desejado (R$)</label><input type="number" step="0.01" id="goalValor" value="${editing ? editing.target : ""}"></div>
      <div class="field"><label>Já guardado (R$)</label><input type="number" step="0.01" id="goalGuardado" value="${editing ? editing.saved : ""}"></div>
    </div>
    <div class="field"><label>Prazo</label><input type="date" id="goalPrazo" value="${editing ? editing.deadline || "" : ""}"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-accent" onclick="window.saveGoal('${editId || ""}')">Salvar</button>
    </div>
  `);
}
function saveGoal(editId) {
  const name = byId("goalNome").value.trim();
  const target = parseFloat(byId("goalValor").value);
  if (!name || !target) { toast("Preencha nome e valor da meta", "danger"); return; }
  const data = {
    name,
    target,
    saved: parseFloat(byId("goalGuardado").value) || 0,
    deadline: byId("goalPrazo").value,
  };
  closeModal();
  toast("Meta salva", "success");
  backgroundWrite(editId ? updateItem(currentUid, "reserves", editId, data) : addItem(currentUid, "reserves", data));
}
function deleteGoal(id) {
  backgroundWrite(deleteItem(currentUid, "reserves", id));
}

function dialSVG(pct, size = 76) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(pct, 1));
  return `<div class="dial" style="width:${size}px;height:${size}px;">
    <svg width="${size}" height="${size}" viewBox="0 0 76 76">
      <circle class="bg" cx="38" cy="38" r="${radius}"></circle>
      <circle class="fg" cx="38" cy="38" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
    </svg>
    <div class="pct">${Math.round(pct * 100)}%</div>
  </div>`;
}
function renderReserve() {
  byId("goalsGrid").innerHTML = reserves.length
    ? reserves.map((g) => {
        const pct = g.target > 0 ? g.saved / g.target : 0;
        const daysLeft = g.deadline ? daysBetween(g.deadline) : null;
        return `<div class="card">
          <div style="display:flex; gap:14px; align-items:center;">
            ${dialSVG(pct)}
            <div style="flex:1;">
              <div style="font-weight:700; font-size:14px;">${esc(g.name)}</div>
              <div style="font-size:11.5px; color:var(--text-faint); margin-top:2px;">${fmtMoney(g.saved)} de ${fmtMoney(g.target)}</div>
              ${g.deadline ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">${daysLeft >= 0 ? `${daysLeft} dia(s) restante(s)` : "Prazo encerrado"}</div>` : ""}
            </div>
          </div>
          <div class="progress-bar" style="margin-top:14px;"><div style="width:${Math.min(pct * 100, 100)}%"></div></div>
          <div class="row-actions" style="justify-content:flex-end; margin-top:10px;">
            <button class="btn-ghost" onclick="window.openGoalModal('${g.id}')">${icon("pencil", 13)} Editar</button>
            <button class="btn-danger-ghost" onclick="window.deleteGoal('${g.id}')">${icon("trash", 13)} Excluir</button>
          </div>
        </div>`;
      }).join("")
    : `<div class="card empty"><span class="ic">${icon("vault", 30)}</span>Crie sua primeira meta financeira</div>`;
}

/* =====================================================================
   9. CONTAS FIXAS
   ===================================================================== */
function openBillModal(editId) {
  const editing = editId ? bills.find((b) => b.id === editId) : null;
  openModal(`
    <div class="modal-head"><h3>${editing ? "Editar" : "Nova"} conta</h3><button class="btn-ghost" onclick="closeModal()">${icon("x", 14)}</button></div>
    <div class="field"><label>Nome</label><input type="text" id="billNome" value="${editing ? esc(editing.name) : ""}" placeholder="Ex: Internet"></div>
    <div class="field-row">
      <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" id="billValor" value="${editing ? editing.amount : ""}"></div>
      <div class="field"><label>Vencimento</label><input type="date" id="billData" value="${editing ? editing.dueDate : ""}"></div>
    </div>
    <div class="field"><label>Status</label><select id="billStatus">
      <option value="pendente" ${editing?.status === "pendente" ? "selected" : ""}>Pendente</option>
      <option value="pago" ${editing?.status === "pago" ? "selected" : ""}>Pago</option>
      <option value="atrasado" ${editing?.status === "atrasado" ? "selected" : ""}>Atrasado</option>
    </select></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-accent" onclick="window.saveBill('${editId || ""}')">Salvar</button>
    </div>
  `);
}
function saveBill(editId) {
  const name = byId("billNome").value.trim();
  const amount = parseFloat(byId("billValor").value);
  const dueDate = byId("billData").value;
  if (!name || !amount || !dueDate) { toast("Preencha todos os campos", "danger"); return; }
  const data = { name, amount, dueDate, status: byId("billStatus").value };
  closeModal();
  toast("Conta salva", "success");
  backgroundWrite(editId ? updateItem(currentUid, "bills", editId, data) : addItem(currentUid, "bills", data));
}
function deleteBill(id) {
  backgroundWrite(deleteItem(currentUid, "bills", id));
}
function cycleBillStatus(id) {
  const bill = bills.find((b) => b.id === id);
  const previous = bill.status;
  const next = previous === "pendente" ? "pago" : previous === "pago" ? "atrasado" : "pendente";
  bill.status = next;
  renderAll();
  backgroundWrite(updateItem(currentUid, "bills", id, { status: next }), () => {
    bill.status = previous;
    renderAll();
  });
}
function renderBills() {
  const sorted = [...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  byId("billsList").innerHTML = sorted.length
    ? sorted.map((b) => {
        const daysLeft = daysBetween(b.dueDate);
        const urgent = b.status !== "pago" && daysLeft <= 3;
        return `<div class="row-item" style="${urgent ? "border-color:var(--danger); box-shadow:0 0 0 1px var(--danger-dim);" : ""}">
          <div class="ic" style="background:var(--accent-dimmer); color:var(--accent);">${icon("receipt", 16)}</div>
          <div class="info"><div class="t1">${esc(b.name)} ${urgent ? `<span class="urgent-flag">${icon("alertTriangle", 13)}</span>` : ""}</div><div class="t2">Vence em ${fmtDate(b.dueDate)} ${daysLeft >= 0 && b.status !== "pago" ? `(${daysLeft}d)` : ""}</div></div>
          <div class="amount">${fmtMoney(b.amount)}</div>
          <span class="badge ${b.status === "pago" ? "paid" : b.status === "atrasado" ? "late" : "pending"}" style="cursor:pointer" onclick="window.cycleBillStatus('${b.id}')">${b.status}</span>
          <div class="row-actions">
            <button class="btn-ghost" onclick="window.openBillModal('${b.id}')">${icon("pencil", 14)}</button>
            <button class="btn-danger-ghost" onclick="window.deleteBill('${b.id}')">${icon("trash", 14)}</button>
          </div>
        </div>`;
      }).join("")
    : `<div class="card empty"><span class="ic">${icon("calendar", 30)}</span>Nenhuma conta cadastrada</div>`;
}

/* =====================================================================
   10. HÁBITOS
   ===================================================================== */
function openHabitModal(editId) {
  const editing = editId ? habits.find((h) => h.id === editId) : null;
  const selectedDays = editing ? editing.days : [1, 2, 3, 4, 5];
  const showDays = editing ? editing.frequency === "semanal" : false;
  openModal(`
    <div class="modal-head"><h3>${editing ? "Editar" : "Novo"} hábito</h3><button class="btn-ghost" onclick="closeModal()">${icon("x", 14)}</button></div>
    <div class="field"><label>Nome</label><input type="text" id="habitNome" value="${editing ? esc(editing.name) : ""}" placeholder="Ex: Beber 2L de água"></div>
    <div class="field"><label>Descrição</label><textarea id="habitDesc" placeholder="Opcional">${editing ? esc(editing.description || "") : ""}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Frequência</label><select id="habitFreq" onchange="document.getElementById('habitDaysField').style.display = this.value==='semanal' ? 'block' : 'none';">
        <option value="diario" ${editing?.frequency === "diario" ? "selected" : ""}>Diário</option>
        <option value="semanal" ${editing?.frequency === "semanal" ? "selected" : ""}>Dias específicos</option>
      </select></div>
      <div class="field"><label>Meta diária</label><input type="number" min="1" id="habitMeta" value="${editing ? editing.dailyGoal : 1}"></div>
    </div>
    <div class="field" id="habitDaysField" style="display:${showDays ? "block" : "none"};">
      <label>Dias da semana</label>
      <div class="chip-select" id="habitDays">${WEEK_DAYS.map((d, i) => `<div class="chip ${selectedDays.includes(i) ? "active" : ""}" data-day="${i}" onclick="this.classList.toggle('active')" role="button" tabindex="0">${d}</div>`).join("")}</div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-accent" onclick="window.saveHabit('${editId || ""}')">Salvar</button>
    </div>
  `);
}
function saveHabit(editId) {
  const name = byId("habitNome").value.trim();
  if (!name) { toast("Informe o nome do hábito", "danger"); return; }
  const days = [...document.querySelectorAll("#habitDays .chip.active")].map((c) => parseInt(c.dataset.day));
  const data = {
    name,
    description: byId("habitDesc").value,
    frequency: byId("habitFreq").value,
    dailyGoal: parseInt(byId("habitMeta").value) || 1,
    days,
  };
  closeModal();
  toast("Hábito salvo", "success");
  if (editId) {
    backgroundWrite(updateItem(currentUid, "habits", editId, data));
  } else {
    backgroundWrite(addItem(currentUid, "habits", { ...data, completions: {} }));
  }
}
function deleteHabit(id) {
  backgroundWrite(deleteItem(currentUid, "habits", id));
}

function habitStreak(habit) {
  const completions = habit.completions || {};
  const completedDates = Object.keys(completions).filter((d) => completions[d]).sort();

  let best = 0;
  let running = 0;
  let prevDate = null;
  completedDates.forEach((d) => {
    running = prevDate && (new Date(d) - new Date(prevDate)) / 86400000 === 1 ? running + 1 : 1;
    best = Math.max(best, running);
    prevDate = d;
  });

  let streak = 0;
  const cursor = new Date();
  while (completions[cursor.toISOString().slice(0, 10)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { streak, best };
}

function toggleHabit(id, ev) {
  const habit = habits.find((h) => h.id === id);
  const iso = todayISO();
  const willComplete = !(habit.completions && habit.completions[iso]);
  if (!habit.completions) habit.completions = {};
  const previousValue = habit.completions[iso];
  habit.completions[iso] = willComplete;
  renderAll();

  if (willComplete && profile.animations && ev) {
    const burst = document.createElement("div");
    burst.className = "burst";
    burst.innerHTML = icon("check", 22);
    burst.style.left = `${ev.clientX - 10}px`;
    burst.style.top = `${ev.clientY - 10}px`;
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 900);
  }

  backgroundWrite(
    updateItem(currentUid, "habits", id, { [`completions.${iso}`]: willComplete }),
    () => {
      habit.completions[iso] = previousValue;
      renderAll();
    }
  );
}

function renderHabits() {
  const iso = todayISO();
  byId("habitsGrid").innerHTML = habits.length
    ? habits.map((h) => {
        const { streak, best } = habitStreak(h);
        const done = !!(h.completions && h.completions[iso]);
        const last14 = Array.from({ length: 14 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (13 - i));
          const key = d.toISOString().slice(0, 10);
          return h.completions?.[key] ? 1 : 0;
        });
        const totalDays = Object.keys(h.completions || {}).length || 1;
        const doneDays = Object.values(h.completions || {}).filter(Boolean).length;
        return `<div class="card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div><div style="font-weight:700; font-size:14px;">${esc(h.name)}</div><div style="font-size:11.5px; color:var(--text-faint); margin-top:2px;">${esc(h.description || "")}</div></div>
            <button class="btn ${done ? "btn-accent" : ""}" onclick="window.toggleHabit('${h.id}', event)" style="padding:7px 12px;">${done ? `${icon("check", 13)} Feito` : "Marcar"}</button>
          </div>
          <div style="display:flex; gap:14px; margin-top:14px;">
            <div><div style="font-size:10.5px; color:var(--text-dim);">STREAK</div><div style="font-weight:700; color:var(--accent); display:flex; align-items:center; gap:4px;">${icon("flame", 13)} ${streak}</div></div>
            <div><div style="font-size:10.5px; color:var(--text-dim);">MELHOR</div><div style="font-weight:700;">${best}</div></div>
            <div><div style="font-size:10.5px; color:var(--text-dim);">CONCLUSÃO</div><div style="font-weight:700;">${Math.round((doneDays / totalDays) * 100)}%</div></div>
          </div>
          <div style="display:flex; gap:3px; margin-top:14px;">
            ${last14.map((v) => `<div style="flex:1; height:20px; border-radius:4px; background:${v ? "var(--accent)" : "var(--graphite)"};"></div>`).join("")}
          </div>
          <div class="row-actions" style="justify-content:flex-end; margin-top:10px;">
            <button class="btn-ghost" onclick="window.openHabitModal('${h.id}')">${icon("pencil", 14)}</button>
            <button class="btn-danger-ghost" onclick="window.deleteHabit('${h.id}')">${icon("trash", 14)}</button>
          </div>
        </div>`;
      }).join("")
    : `<div class="card empty"><span class="ic">${icon("checkCircle", 30)}</span>Crie seu primeiro hábito</div>`;
}

/* =====================================================================
   11. NOTAS
   ===================================================================== */
function openNoteModal(editId) {
  const editing = editId ? notes.find((n) => n.id === editId) : null;
  openModal(`
    <div class="modal-head"><h3>${editing ? "Editar" : "Nova"} nota</h3><button class="btn-ghost" onclick="closeModal()">${icon("x", 14)}</button></div>
    <div class="field"><label>Título</label><input type="text" id="noteTitulo" value="${editing ? esc(editing.title) : ""}"></div>
    <div class="field"><label>Conteúdo</label><textarea id="noteConteudo" style="min-height:120px;">${editing ? esc(editing.content) : ""}</textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-accent" onclick="window.saveNote('${editId || ""}')">Salvar</button>
    </div>
  `);
}
function saveNote(editId) {
  const title = byId("noteTitulo").value.trim() || "Sem título";
  const content = byId("noteConteudo").value;
  closeModal();
  toast("Nota salva", "success");
  if (editId) {
    backgroundWrite(updateItem(currentUid, "notes", editId, { title, content }));
  } else {
    backgroundWrite(addItem(currentUid, "notes", { title, content, date: todayISO(), pinned: false }));
  }
}
function deleteNote(id) {
  backgroundWrite(deleteItem(currentUid, "notes", id));
}
function togglePin(id) {
  const note = notes.find((n) => n.id === id);
  const previous = note.pinned;
  note.pinned = !previous;
  renderAll();
  backgroundWrite(updateItem(currentUid, "notes", id, { pinned: note.pinned }), () => {
    note.pinned = previous;
    renderAll();
  });
}
function renderNotes() {
  const query = (byId("noteSearch").value || "").toLowerCase();
  const filtered = notes
    .filter((n) => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query))
    .sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));

  byId("notesGrid").innerHTML = filtered.length
    ? filtered.map((n) => `
      <div class="note-card ${n.pinned ? "pinned" : ""}">
        <button class="pin" onclick="window.togglePin('${n.id}')" aria-label="Fixar nota">${icon("pin", 14)}</button>
        <h4>${esc(n.title)}</h4>
        <p>${esc(n.content)}</p>
        <div class="meta"><span>${fmtDate(n.date)}</span>
          <span class="row-actions"><button class="btn-ghost" onclick="window.openNoteModal('${n.id}')">${icon("pencil", 14)}</button><button class="btn-danger-ghost" onclick="window.deleteNote('${n.id}')">${icon("trash", 14)}</button></span>
        </div>
      </div>`).join("")
    : `<div class="card empty" style="grid-column:1/-1;"><span class="ic">${icon("fileText", 30)}</span>Nenhuma nota encontrada</div>`;
}
let noteSearchTimer = null;
byId("noteSearch")?.addEventListener("input", () => {
  clearTimeout(noteSearchTimer);
  noteSearchTimer = setTimeout(renderNotes, 120);
});

/* =====================================================================
   12. TREINOS
   ===================================================================== */
let activeGroupFilter = "Todos";

function openWorkoutModal() {
  openModal(`
    <div class="modal-head"><h3>Registrar exercício</h3><button class="btn-ghost" onclick="closeModal()">${icon("x", 14)}</button></div>
    <div class="field"><label>Grupo muscular</label><select id="wkGrupo">${MUSCLE_GROUPS.map((g) => `<option>${g}</option>`).join("")}</select></div>
    <div class="field"><label>Exercício</label><input type="text" id="wkExercicio" placeholder="Ex: Supino reto"></div>
    <div class="field-row">
      <div class="field"><label>Séries</label><input type="number" id="wkSeries" value="3"></div>
      <div class="field"><label>Repetições</label><input type="number" id="wkReps" value="10"></div>
      <div class="field"><label>Peso (kg)</label><input type="number" step="0.5" id="wkPeso" value="0"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Data</label><input type="date" id="wkData" value="${todayISO()}"></div>
      <div class="field"><label>Duração (min)</label><input type="number" id="wkDuracao" value="45"></div>
    </div>
    <div class="field"><label>Observações</label><textarea id="wkObs" placeholder="Opcional"></textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-accent" onclick="window.saveWorkout()">Salvar</button>
    </div>
  `);
}
function saveWorkout() {
  const exercise = byId("wkExercicio").value.trim();
  if (!exercise) { toast("Informe o nome do exercício", "danger"); return; }
  const data = {
    group: byId("wkGrupo").value,
    exercise,
    sets: parseInt(byId("wkSeries").value) || 0,
    reps: parseInt(byId("wkReps").value) || 0,
    weight: parseFloat(byId("wkPeso").value) || 0,
    date: byId("wkData").value || todayISO(),
    duration: parseInt(byId("wkDuracao").value) || 0,
    notes: byId("wkObs").value,
  };
  closeModal();
  toast("Treino registrado", "success");
  backgroundWrite(addItem(currentUid, "workouts", data));
}
function deleteWorkout(id) {
  backgroundWrite(deleteItem(currentUid, "workouts", id));
}
function setGroupFilter(group) {
  activeGroupFilter = group;
  renderWorkouts();
}
function renderWorkouts() {
  byId("wkTotal").textContent = workoutLogs.length;
  const avgTime = workoutLogs.length ? Math.round(workoutLogs.reduce((sum, l) => sum + l.duration, 0) / workoutLogs.length) : 0;
  byId("wkAvgTime").textContent = `${avgTime} min`;

  const counts = {};
  workoutLogs.forEach((l) => { counts[l.group] = (counts[l.group] || 0) + 1; });
  const topGroup = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "—";
  byId("wkTopGroup").textContent = topGroup;

  byId("workoutTabs").innerHTML = ["Todos", ...MUSCLE_GROUPS]
    .map((g) => `<div class="tab ${activeGroupFilter === g ? "active" : ""}" onclick="window.setGroupFilter('${g}')">${g}</div>`)
    .join("");

  const filtered = activeGroupFilter === "Todos" ? workoutLogs : workoutLogs.filter((l) => l.group === activeGroupFilter);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  byId("workoutHistory").innerHTML = sorted.length
    ? sorted.map((l) => `
      <div class="row-item">
        <div class="ic" style="background:var(--accent-dimmer); color:var(--accent);">${icon("dumbbell", 16)}</div>
        <div class="info"><div class="t1">${esc(l.exercise)} <span style="color:var(--text-faint); font-weight:400;">· ${esc(l.group)}</span></div>
        <div class="t2">${fmtDate(l.date)} · ${l.sets}x${l.reps} · ${l.weight}kg</div></div>
        <div class="row-actions"><button class="btn-danger-ghost" onclick="window.deleteWorkout('${l.id}')">${icon("trash", 14)}</button></div>
      </div>`).join("")
    : `<div class="empty"><span class="ic">${icon("dumbbell", 30)}</span>Nenhum treino registrado</div>`;

  drawLoadChart(filtered);
}

/* =====================================================================
   13. DASHBOARD PRINCIPAL
   ===================================================================== */
function renderDashboard() {
  const totalIn = transactions.filter((t) => t.type === "receita").reduce((sum, t) => sum + t.amount, 0);
  const totalOut = transactions.filter((t) => t.type === "despesa").reduce((sum, t) => sum + t.amount, 0);
  const balance = totalIn - totalOut;
  const mainGoal = reserves[0];
  const iso = todayISO();
  const habitsToday = habits.filter((h) => !h.frequency || h.frequency === "diario" || (h.days || []).includes(new Date().getDay()));
  const habitsDoneToday = habitsToday.filter((h) => h.completions?.[iso]).length;
  const workoutToday = workoutLogs.find((w) => w.date === iso);

  byId("dashCards").innerHTML = `
    <div class="card stat-card"><div class="top-row"><span class="label">Saldo atual</span><div class="ic-badge">${icon("wallet", 18)}</div></div><div class="value">${fmtMoney(balance)}</div></div>
    <div class="card stat-card"><div class="top-row"><span class="label">Meta financeira</span><div class="ic-badge">${icon("vault", 18)}</div></div><div class="value">${mainGoal ? Math.round((mainGoal.saved / mainGoal.target) * 100) + "%" : "—"}</div><div class="delta">${mainGoal ? esc(mainGoal.name) : "nenhuma meta criada"}</div></div>
    <div class="card stat-card"><div class="top-row"><span class="label">Hábitos hoje</span><div class="ic-badge">${icon("checkCircle", 18)}</div></div><div class="value">${habitsDoneToday}/${habitsToday.length}</div></div>
    <div class="card stat-card"><div class="top-row"><span class="label">Treino do dia</span><div class="ic-badge">${icon("dumbbell", 18)}</div></div><div class="value" style="font-size:15px;">${workoutToday ? esc(workoutToday.exercise) : "Sem registro"}</div></div>
    <div class="card stat-card"><div class="top-row"><span class="label">Notas</span><div class="ic-badge">${icon("fileText", 18)}</div></div><div class="value">${notes.length}</div></div>
  `;

  const billsSoon = bills.filter((b) => b.status !== "pago" && daysBetween(b.dueDate) <= 3 && daysBetween(b.dueDate) >= 0);
  const summary = [
    { ic: icon("wallet", 16), label: "Saldo disponível", val: fmtMoney(balance) },
    { ic: icon("checkCircle", 16), label: "Hábitos concluídos", val: `${habitsDoneToday} de ${habitsToday.length}` },
    { ic: icon("calendar", 16), label: "Contas vencendo em breve", val: `${billsSoon.length}` },
    { ic: icon("pin", 16), label: "Notas fixadas", val: `${notes.filter((n) => n.pinned).length}` },
  ];
  byId("todaySummary").innerHTML = summary.map((s) => `
    <div class="row-item"><div class="ic" style="background:var(--accent-dimmer); color:var(--accent);">${s.ic}</div>
    <div class="info"><div class="t1">${s.label}</div></div><div class="amount">${s.val}</div></div>`).join("");

  const upcoming = [...bills].filter((b) => b.status !== "pago").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
  byId("upcomingBills").innerHTML = upcoming.length
    ? upcoming.map((b) => {
        const urgent = daysBetween(b.dueDate) <= 3;
        return `<div class="row-item" style="${urgent ? "border-color:var(--danger);" : ""}">
          <div class="ic" style="background:${urgent ? "var(--danger-dim)" : "var(--accent-dimmer)"}; color:${urgent ? "var(--danger)" : "var(--accent)"};">${icon("receipt", 16)}</div>
          <div class="info"><div class="t1">${esc(b.name)}</div><div class="t2">Vence em ${fmtDate(b.dueDate)}</div></div>
          <div class="amount">${fmtMoney(b.amount)}</div>
        </div>`;
      }).join("")
    : `<div class="empty"><span class="ic">${icon("calendar", 30)}</span>Nenhuma conta pendente</div>`;

  drawFinanceEvolutionChart();
  drawHabitsEvolutionChart();
}

/* =====================================================================
   14. GRÁFICOS — canvas nativo, sem dependências externas
   ===================================================================== */
function setupCanvas(id) {
  const canvas = byId(id);
  const parent = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = parent.clientWidth * dpr;
  canvas.height = parent.clientHeight * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, w: parent.clientWidth, h: parent.clientHeight };
}

function drawBars(id, labels, values, colorVar = "--accent", negativeColorVar = "--danger") {
  const { ctx, w, h } = setupCanvas(id);
  ctx.clearRect(0, 0, w, h);
  const styles = getComputedStyle(document.body);
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const padBottom = 22;
  const padTop = 10;
  const barWidth = w / values.length;

  values.forEach((v, i) => {
    const barHeight = (Math.abs(v) / max) * (h - padBottom - padTop);
    const x = i * barWidth + barWidth * 0.22;
    const bw = barWidth * 0.56;
    const y = h - padBottom - barHeight;
    ctx.fillStyle = styles.getPropertyValue(v >= 0 ? colorVar : negativeColorVar).trim();
    ctx.beginPath();
    const r = 4;
    ctx.moveTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + bw - r, y);
    ctx.arcTo(x + bw, y, x + bw, y + r, r);
    ctx.lineTo(x + bw, y + barHeight);
    ctx.lineTo(x, y + barHeight);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = styles.getPropertyValue("--text-faint").trim();
    ctx.font = "10.5px Inter";
    ctx.textAlign = "center";
    ctx.fillText(labels[i], x + bw / 2, h - 6);
  });
}

function drawLine(id, labels, values) {
  const { ctx, w, h } = setupCanvas(id);
  ctx.clearRect(0, 0, w, h);
  const styles = getComputedStyle(document.body);
  const accent = styles.getPropertyValue("--accent").trim();
  const max = Math.max(1, ...values);
  const padBottom = 22, padTop = 14, padLeft = 6, padRight = 6;
  const stepX = (w - padLeft - padRight) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => ({ x: padLeft + i * stepX, y: padTop + (1 - v / max) * (h - padBottom - padTop) }));

  ctx.beginPath();
  ctx.moveTo(points[0].x, h - padBottom);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, h - padBottom);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "rgba(245,197,24,0.25)");
  gradient.addColorStop(1, "rgba(245,197,24,0)");
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.stroke();

  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  });

  ctx.fillStyle = styles.getPropertyValue("--text-faint").trim();
  ctx.font = "10.5px Inter";
  ctx.textAlign = "center";
  labels.forEach((l, i) => ctx.fillText(l, points[i].x, h - 6));
}

function lastNMonths(n) {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => new Date(today.getFullYear(), today.getMonth() - (n - 1 - i), 1));
}

function drawFinanceEvolutionChart() {
  const months = lastNMonths(6);
  const labels = months.map((m) => m.toLocaleDateString("pt-BR", { month: "short" }));
  const values = months.map((m) => {
    const ym = m.toISOString().slice(0, 7);
    const monthTx = transactions.filter((t) => t.date.startsWith(ym));
    return monthTx.filter((t) => t.type === "receita").reduce((s, t) => s + t.amount, 0)
      - monthTx.filter((t) => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
  });
  drawBars("chartFinance", labels, values);
}
function drawFinanceMonthlyChart() {
  const months = lastNMonths(6);
  const labels = months.map((m) => m.toLocaleDateString("pt-BR", { month: "short" }));
  const values = months.map((m) => {
    const ym = m.toISOString().slice(0, 7);
    return transactions.filter((t) => t.date.startsWith(ym) && t.type === "despesa").reduce((s, t) => s + t.amount, 0);
  });
  drawBars("chartFinanceMonthly", labels, values, "--accent", "--accent");
}
function drawHabitsEvolutionChart() {
  const labels = [];
  const values = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    labels.push(WEEK_DAYS[d.getDay()]);
    const total = habits.length || 1;
    const done = habits.filter((h) => h.completions?.[iso]).length;
    values.push(Math.round((done / total) * 100));
  }
  drawLine("chartHabits", labels, values);
}
function drawLoadChart(logs) {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
  if (!sorted.length) {
    const { ctx, w, h } = setupCanvas("chartLoad");
    ctx.clearRect(0, 0, w, h);
    return;
  }
  drawLine("chartLoad", sorted.map((l) => fmtDate(l.date).slice(0, 5)), sorted.map((l) => l.weight));
}

/* =====================================================================
   15. CONFIGURAÇÕES
   ===================================================================== */
function avatarMarkup(photo, fallbackLetter) {
  return photo ? `<img src="${esc(photo)}" alt="">` : esc((fallbackLetter || "U").toUpperCase());
}

function renderSettings() {
  byId("cfgName").value = profile.name || "";
  byId("avatarBigInner").innerHTML = avatarMarkup(profile.photo, (profile.name || "U")[0]);

  byId("colorDots").innerHTML = Object.entries(ACCENTS).map(([key, hex]) =>
    `<div class="color-dot ${profile.accent === key ? "active" : ""}" style="background:${hex};" onclick="window.setAccent('${key}')" role="button" tabindex="0" aria-label="Cor ${key}"></div>`
  ).join("");

  byId("animToggle").classList.toggle("on", !!profile.animations);
}

function saveProfile() {
  const name = byId("cfgName").value.trim() || "Usuário";
  const previous = profile.name;
  profile = { ...profile, name };
  renderAll();
  toast("Perfil atualizado", "success");
  backgroundWrite(updateUserProfile(currentUid, { name }), () => {
    profile = { ...profile, name: previous };
    renderAll();
  });
}

function setAccent(key) {
  const previous = profile.accent;
  profile = { ...profile, accent: key };
  applyAccent();
  renderSettings();
  backgroundWrite(updateUserProfile(currentUid, { accent: key }), () => {
    profile = { ...profile, accent: previous };
    applyAccent();
    renderSettings();
  });
}

function applyAccent() {
  const hex = ACCENTS[profile.accent] || ACCENTS.gold;
  document.documentElement.style.setProperty("--accent", hex);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  document.documentElement.style.setProperty("--accent-rgb", `${r},${g},${b}`);
}

function toggleAnim() {
  const next = !profile.animations;
  profile = { ...profile, animations: next };
  document.body.dataset.anim = next ? "on" : "off";
  renderSettings();
  backgroundWrite(updateUserProfile(currentUid, { animations: next }), () => {
    profile = { ...profile, animations: !next };
    document.body.dataset.anim = !next ? "on" : "off";
    renderSettings();
  });
}

/* ---------- Upload da foto de perfil ---------- */
byId("avatarBig")?.addEventListener("click", () => byId("avatarFileInput").click());
byId("avatarFileInput")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  const avatarBig = byId("avatarBig");
  const inner = byId("avatarBigInner");
  const previousHTML = inner.innerHTML;
  const previewUrl = URL.createObjectURL(file);
  inner.innerHTML = `<img src="${previewUrl}" alt="">`;
  avatarBig.classList.add("uploading");

  try {
    const finalUrl = await uploadProfilePhoto(currentUid, file);
    await updateUserProfile(currentUid, { photo: finalUrl });
    toast("Foto de perfil atualizada", "success");
  } catch (err) {
    inner.innerHTML = previousHTML;
    toast(err instanceof PhotoValidationError ? err.message : "Não foi possível enviar a imagem", "danger");
  } finally {
    avatarBig.classList.remove("uploading");
    URL.revokeObjectURL(previewUrl);
  }
});

/* ---------- Exportar / importar / limpar dados ---------- */
function exportData() {
  const backup = { profile, transactions, reserves, bills, habits, notes, workouts: workoutLogs };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vigilante-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Dados exportados", "success");
}

byId("importFile")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      const jobs = [];
      if (imported.profile) jobs.push(updateUserProfile(currentUid, imported.profile));
      ["transactions", "reserves", "bills", "habits", "notes"].forEach((key) => {
        (imported[key] || []).forEach(({ id, ...rest }) => jobs.push(addItem(currentUid, key, rest)));
      });
      (imported.workouts || []).forEach(({ id, ...rest }) => jobs.push(addItem(currentUid, "workouts", rest)));
      await Promise.all(jobs);
      toast("Dados importados com sucesso", "success");
    } catch (err) {
      toast("Arquivo inválido", "danger");
    }
  };
  reader.readAsText(file);
});

async function clearData() {
  if (!confirm("Isso apagará todos os seus dados permanentemente. Deseja continuar?")) return;
  const collections = { transactions, reserves, bills, habits, notes, workouts: workoutLogs };
  const jobs = Object.entries(collections).flatMap(([key, arr]) => arr.map((item) => deleteItem(currentUid, key, item.id)));
  jobs.push(updateUserProfile(currentUid, { name: profile.name, photo: "", accent: "gold", animations: true }));
  await Promise.all(jobs);
  toast("Dados limpos");
}

/* =====================================================================
   16. RENDER GERAL — só desenha a view que está visível no momento
   ===================================================================== */
function renderAll() {
  byId("sideName").textContent = profile.name || "Usuário";
  byId("sideAvatar").innerHTML = avatarMarkup(profile.photo, (profile.name || "U")[0]);

  const activeView = document.querySelector(".view.active");
  if (!activeView) return;

  const renderers = {
    "view-dashboard": renderDashboard,
    "view-financeiro": renderFinance,
    "view-reserva": renderReserve,
    "view-contas": renderBills,
    "view-habitos": renderHabits,
    "view-notas": renderNotes,
    "view-treinos": renderWorkouts,
    "view-config": renderSettings,
  };
  renderers[activeView.id]?.();
}

/* =====================================================================
   17. EXPOSIÇÃO GLOBAL — funções chamadas via onclick="" no HTML gerado
   ===================================================================== */
Object.assign(window, {
  openTxModal, saveTx, deleteTx,
  openGoalModal, saveGoal, deleteGoal,
  openBillModal, saveBill, deleteBill, cycleBillStatus,
  openHabitModal, saveHabit, deleteHabit, toggleHabit,
  openNoteModal, saveNote, deleteNote, togglePin,
  openWorkoutModal, saveWorkout, deleteWorkout, setGroupFilter,
  saveProfile, setAccent, toggleAnim, exportData, clearData,
  closeModal, goToUpgrade,
});

/* =====================================================================
   18. INICIALIZAÇÃO
   ===================================================================== */
updateClock();

// Registra o Service Worker (PWA) — só depois que a página terminar de
// carregar, pra não disputar banda/prioridade com os recursos essenciais.
// "in navigator" checa se o navegador suporta a API antes de tentar usar.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.error("Falha ao registrar o Service Worker:", err);
    });
  });
}
