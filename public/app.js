/* Lista de Saldo - Vanilla JS + API (db.json no servidor)
   - Persistência: /api/state (GET/PUT)
   - Débito automático: 08:00 (por loja, 1x/dia)
   - Edição inline: Saldo e Orçamento
*/

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function pad2(n){ return String(n).padStart(2,"0"); }
function dateKeyLocal(d = new Date()){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function timeAtLocal(dateKey, hh=8, mm=0, ss=0){
  const [y,m,d] = dateKey.split("-").map(Number);
  return new Date(y, m-1, d, hh, mm, ss, 0);
}
function nextRunLabel(now = new Date()){
  const todayKey = dateKeyLocal(now);
  const todayAt8 = timeAtLocal(todayKey, 8, 0, 0);
  if(now < todayAt8) return `${todayKey} 08:00`;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
  const k = dateKeyLocal(t);
  return `${k} 08:00`;
}
function slugId(name){
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || ("loja-" + Math.random().toString(16).slice(2));
}
function safeNumber(n){ return Number.isFinite(n) ? n : null; }

function parseMoneyLoose(input){
  if(input == null) return { kind:"null" };
  let s = String(input).trim();
  if(!s) return { kind:"null" };
  const up = s.toUpperCase();
  if(up.includes("SEM SALDO")) return { kind:"null" };

  s = s.replace(/R\$\s?/gi, "").replace(/\s+/g, "");

  if(s.includes(",")){
    s = s.replace(/\./g, "").replace(",", ".");
  }
  if(!/^-?[0-9]*\.?[0-9]*$/.test(s)) return { kind:"invalid" };

  const v = Number(s);
  if(!Number.isFinite(v)) return { kind:"invalid" };
  if(v < 0) return { kind:"invalid" };
  return { kind:"num", value: v };
}
function moneyToInputValue(n){
  if(!Number.isFinite(n)) return "";
  const fixed = n.toFixed(2);
  const [intPart, dec] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withThousands},${dec}`;
}

async function apiHealth(){
  try{
    const r = await fetch("/api/health");
    if(!r.ok) throw new Error(String(r.status));
    return true;
  } catch { return false; }
}
async function apiLoad(){
  const r = await fetch("/api/state", { cache: "no-store" });
  if(!r.ok) throw new Error(`GET /api/state ${r.status}`);
  const st = await r.json();
  return normalizeState(st);
}
async function apiSave(fullState){
  const r = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fullState)
  });
  if(!r.ok) throw new Error(`PUT /api/state ${r.status}`);
}

async function apiSaveKeepalive(fullState){
  // tenta salvar mesmo durante refresh/fechamento de aba
  try{
    const r = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullState),
      keepalive: true
    });
    return r.ok;
  } catch {
    return false;
  }
}


function normalizeState(st){
  const out = { stores: [], meta: { lastGlobalRunAt: null } };
  out.meta.lastGlobalRunAt = st?.meta?.lastGlobalRunAt ?? null;

  const arr = Array.isArray(st?.stores) ? st.stores : [];
  out.stores = arr.map(s => ({
    id: s.id || slugId(s.nome || "loja"),
    nome: String(s.nome || "").trim(),
    saldo: (s.saldo === null || s.saldo === undefined) ? null : safeNumber(Number(s.saldo)),
    orcamentoDiario: safeNumber(Number(s.orcamentoDiario)) ?? 0,
    ultimaExecucao: s.ultimaExecucao || null,
    ativa: (s.ativa === false) ? false : true
  })).filter(s => s.nome);
  return out;
}

function setMsg(text){
  document.getElementById("importMsg").textContent = text || "";
}

function statusOf(store){
  if(store.saldo === null) return "SEM SALDO";
  if(typeof store.saldo === "number" && store.saldo < 100) return "ATENÇÃO";
  return "";
}
function rowClass(store){
  if(store.saldo === null) return "row--danger";
  if(typeof store.saldo === "number" && store.saldo < 100) return "row--warn";
  return "";
}
function badgeHTML(store){
  const st = statusOf(store);
  if(st === "SEM SALDO") return '<span class="badge badge--danger">SEM SALDO</span>';
  if(st === "ATENÇÃO") return '<span class="badge badge--warn">ATENÇÃO</span>';
  return '<span class="badge badge--none">OK</span>';
}

let state = { stores: [], meta: { lastGlobalRunAt: null } };

// ---- Debounced save
let saveTimer = null;
let inFlight = false;
let pending = false;

function scheduleSave(reason=""){
  pending = true;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(reason), 600);
}
async function flushSave(reason=""){
  if(inFlight) return;
  if(!pending) return;
  pending = false;
  inFlight = true;
  try{
    await apiSave(state);
    setApiLabel("OK");
  } catch(e){
    console.error("Falha ao salvar:", e);
    setApiLabel("ERRO ao salvar");
    // try later
    pending = true;
  } finally {
    inFlight = false;
    if(pending) scheduleSave("retry");
  }
}

function setApiLabel(t){
  document.getElementById("apiLabel").textContent = t;
}

// ---- Rendering
function render(){
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";
  const stores = [...state.stores].sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR"));

  for(const store of stores){
    const tr = document.createElement("tr");
    tr.className = rowClass(store);

    const tdName = document.createElement("td");
    tdName.textContent = store.nome;

    const tdSaldo = document.createElement("td");
    tdSaldo.className = "right";
    tdSaldo.appendChild(makeEditableMoneyInput(store, "saldo"));

    const tdOrc = document.createElement("td");
    tdOrc.className = "right";
    tdOrc.appendChild(makeEditableMoneyInput(store, "orcamentoDiario"));

    const tdStatus = document.createElement("td");
    tdStatus.className = "center";
    tdStatus.innerHTML = badgeHTML(store);

    tr.appendChild(tdName);
    tr.appendChild(tdSaldo);
    tr.appendChild(tdOrc);
    tr.appendChild(tdStatus);
    tbody.appendChild(tr);
  }

  updateMetaLabels();
}

function makeEditableMoneyInput(store, field){
  const input = document.createElement("input");
  input.className = "cellInput";
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";

  const isSaldo = field === "saldo";

  input.value = isSaldo
    ? (store.saldo === null ? "SEM SALDO" : moneyToInputValue(store.saldo))
    : moneyToInputValue(store.orcamentoDiario ?? 0);

  input.addEventListener("focus", () => {
    input.classList.remove("invalid");
    if(isSaldo){
      input.value = (store.saldo === null) ? "" : moneyToInputValue(store.saldo);
      input.placeholder = "SEM SALDO";
    } else {
      input.value = moneyToInputValue(store.orcamentoDiario ?? 0);
      input.placeholder = "0,00";
    }
    setTimeout(() => input.select(), 0);
  });

  input.addEventListener("keydown", (ev) => {
    if(ev.key === "Escape"){
      input.classList.remove("invalid");
      input.value = isSaldo
        ? (store.saldo === null ? "SEM SALDO" : moneyToInputValue(store.saldo))
        : moneyToInputValue(store.orcamentoDiario ?? 0);
      input.blur();
    }
    if(ev.key === "Enter"){
      input.blur();
    }
  });

  input.addEventListener("blur", () => {
    const parsed = parseMoneyLoose(input.value);

    if(isSaldo){
      if(parsed.kind === "invalid"){
        input.classList.add("invalid");
        input.value = (store.saldo === null) ? "SEM SALDO" : moneyToInputValue(store.saldo);
        return;
      }
      store.saldo = (parsed.kind === "null") ? null : parsed.value;
      scheduleSave("saldo edit");
      render();
      return;
    } else {
      if(parsed.kind === "invalid"){
        input.classList.add("invalid");
        input.value = moneyToInputValue(store.orcamentoDiario ?? 0);
        return;
      }
      const v = (parsed.kind === "null") ? 0 : parsed.value;
      store.orcamentoDiario = v;
      scheduleSave("orcamento edit");
      render();
      return;
    }
  });

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.gap = "8px";
  wrap.style.justifyContent = "flex-end";
  wrap.style.alignItems = "center";

  const prefix = document.createElement("span");
  prefix.className = "muted";
  prefix.style.fontSize = "12px";
  prefix.textContent = (isSaldo && store.saldo === null) ? "" : "R$";

  wrap.appendChild(prefix);
  wrap.appendChild(input);

  const syncPrefix = () => {
    if(isSaldo){
      prefix.textContent = (store.saldo === null) ? "" : "R$";
      if(store.saldo === null && document.activeElement !== input) input.value = "SEM SALDO";
      if(store.saldo !== null && document.activeElement !== input) input.value = moneyToInputValue(store.saldo);
    } else {
      prefix.textContent = "R$";
      if(document.activeElement !== input) input.value = moneyToInputValue(store.orcamentoDiario ?? 0);
    }
  };
  syncPrefix();
  input.addEventListener("blur", syncPrefix);

  return wrap;
}

// ---- Import
function parseImportedList(text){
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length);

  const parsed = [];
  for(const line of lines){
    if(/^lista\s+de\s+saldos?/i.test(line)) continue;

    const parts = line.split("=");
    const nome = (parts[0] || "").trim();
    if(!nome) continue;

    const rhs = (parts.slice(1).join("=").trim());
    const money = parseMoneyLoose(rhs);
    const saldo = (money.kind === "num") ? money.value : null;

    parsed.push({ nome, saldo });
  }
  return parsed;
}

function upsertStoresFromImport(items){
  let created = 0, updated = 0;
  const byName = new Map(state.stores.map(s => [s.nome.toLowerCase(), s]));

  for(const it of items){
    const existing = byName.get(it.nome.toLowerCase());
    if(existing){
      existing.saldo = it.saldo; // import sobrescreve saldo
      existing.ativa = true;
      updated++;
    } else {
      const s = {
        id: slugId(it.nome),
        nome: it.nome,
        saldo: it.saldo,
        orcamentoDiario: 0,
        ultimaExecucao: null,
        ativa: true
      };
      state.stores.push(s);
      byName.set(it.nome.toLowerCase(), s);
      created++;
    }
  }
  return { created, updated };
}

// ---- Daily automation
function discountStoreIfDue(store, todayKey, now){
  if(store.ativa === false) return false;
  if(store.saldo === null) return false;

  const dueTime = timeAtLocal(todayKey, 8, 0, 0);
  if(now < dueTime) return false;

  if(store.ultimaExecucao === todayKey) return false;

  const budget = Number(store.orcamentoDiario) || 0;

  // mark executed even if budget 0 to avoid repeated checks
  if(budget <= 0){
    store.ultimaExecucao = todayKey;
    return true;
  }

  if(typeof store.saldo !== "number" || !Number.isFinite(store.saldo)) return false;

  if(store.saldo >= budget){
    store.saldo = Number((store.saldo - budget).toFixed(2));
  } else {
    store.saldo = null; // SEM SALDO
  }
  store.ultimaExecucao = todayKey;
  return true;
}

function runDailyAutomation(){
  const now = new Date();
  const todayKey = dateKeyLocal(now);

  let changed = false;
  for(const s of state.stores){
    const did = discountStoreIfDue(s, todayKey, now);
    if(did) changed = true;
  }
  if(changed){
    state.meta.lastGlobalRunAt = now.toISOString();
    scheduleSave("daily automation");
    render();
  } else {
    updateMetaLabels();
  }
}

function runManualToday(){
  const now = new Date();
  const todayKey = dateKeyLocal(now);

  let changed = false;
  for(const s of state.stores){
    if(s.ativa === false) continue;
    if(s.saldo === null) continue;
    if(s.ultimaExecucao === todayKey) continue;

    const budget = Number(s.orcamentoDiario) || 0;
    if(budget <= 0){
      s.ultimaExecucao = todayKey;
      changed = true;
      continue;
    }
    if(typeof s.saldo !== "number" || !Number.isFinite(s.saldo)) continue;

    if(s.saldo >= budget){
      s.saldo = Number((s.saldo - budget).toFixed(2));
    } else {
      s.saldo = null;
    }
    s.ultimaExecucao = todayKey;
    changed = true;
  }

  if(changed){
    state.meta.lastGlobalRunAt = now.toISOString();
    scheduleSave("manual run");
    render();
    setMsg("Execução manual aplicada (apenas lojas que ainda não rodaram hoje).");
  } else {
    setMsg("Nada para executar agora (já rodou hoje ou sem saldo).");
  }
}

function updateMetaLabels(){
  const now = new Date();
  const nowLabel = `${dateKeyLocal(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  document.getElementById("nowLabel").textContent = nowLabel;

  const last = state.meta.lastGlobalRunAt ? new Date(state.meta.lastGlobalRunAt) : null;
  document.getElementById("lastRunLabel").textContent =
    last ? `${dateKeyLocal(last)} ${pad2(last.getHours())}:${pad2(last.getMinutes())}` : "—";

  document.getElementById("nextRunLabel").textContent = nextRunLabel(now);
}

// ---- Export / Reset / Reload
function exportJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "saldo-system-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function reloadFromServer(){
  try{
    setMsg("Recarregando do servidor...");
    state = await apiLoad();
    setMsg("Recarregado.");
    render();
  } catch(e){
    console.error(e);
    setMsg("Falha ao recarregar do servidor.");
  }
}

async function resetServerDB(){
  // Usa endpoint dedicado /api/reset (POST) para zerar no Redis.

  const ok = confirm("Tem certeza? Isso vai zerar o db.json no servidor.");
  if(!ok) return;
  try{ await fetch("/api/reset", { method: "POST" }); } catch(e) {}
  state = { stores: [], meta: { lastGlobalRunAt: null } };
  scheduleSave("reset");
  render();
  setMsg("db.json resetado.");
}

// ---- Boot
async function boot(){
  const ok = await apiHealth();
  setApiLabel(ok ? "OK" : "OFF");

  try{
    state = await apiLoad();
    setMsg("Dados carregados do servidor.");
  } catch(e){
    console.error(e);
    setMsg("Não consegui carregar do servidor. Verifique se o backend está rodando.");
  }

  render();
  runDailyAutomation();

  document.getElementById("importBtn").addEventListener("click", () => {
    const text = document.getElementById("importText").value;
    const items = parseImportedList(text);
    if(items.length === 0){
      setMsg("Nada para importar. Cole sua lista no campo acima.");
      return;
    }
    const { created, updated } = upsertStoresFromImport(items);
    // salva imediatamente para não perder ao dar refresh
    try{ await apiSave(state); setApiLabel("OK"); }
    catch(e){ console.error(e); setApiLabel("ERRO ao salvar"); }
    render();
    setMsg(`Importação concluída: ${updated} atualizadas, ${created} novas.`);
  });

  document.getElementById("recalcBtn").addEventListener("click", runManualToday);
  document.getElementById("exportBtn").addEventListener("click", exportJSON);
  document.getElementById("reloadBtn").addEventListener("click", reloadFromServer);
  document.getElementById("resetBtn").addEventListener("click", resetServerDB);

  document.addEventListener("visibilitychange", () => { if(!document.hidden) runDailyAutomation(); });
  window.addEventListener("focus", runDailyAutomation);

  // tenta salvar pendências ao fechar/atualizar
  window.addEventListener("beforeunload", () => {
    try{ apiSaveKeepalive(state); } catch(e) {}
  });

  setInterval(runDailyAutomation, 60_000);
  setInterval(updateMetaLabels, 1_000);
}

boot();
