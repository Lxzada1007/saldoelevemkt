// app-core.js (shared helpers + API)
export const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function pad2(n){ return String(n).padStart(2,"0"); }

export function dateKeyLocal(d = new Date()){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

export function nextRunLabel(now = new Date()){
  const todayKey = dateKeyLocal(now);
  const todayAt8 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
  if(now < todayAt8) return `${todayKey} 08:00`;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
  const k = dateKeyLocal(t);
  return `${k} 08:00`;
}

export function slugId(name){
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || ("loja-" + Math.random().toString(16).slice(2));
}

export function safeNumber(n){ return Number.isFinite(n) ? n : null; }

export function parseMoneyLoose(input){
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

export function moneyToInputValue(n){
  if(!Number.isFinite(n)) return "";
  const fixed = n.toFixed(2);
  const [intPart, dec] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withThousands},${dec}`;
}

export function normalizeState(st){
  const out = { stores: [], meta: { lastGlobalRunAt: null, version: 0 } };
  out.meta.lastGlobalRunAt = st?.meta?.lastGlobalRunAt ?? null;
  out.meta.version = Number.isFinite(Number(st?.meta?.version)) ? Number(st.meta.version) : 0;

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

export function statusOf(store){
  if(store.saldo === null) return "SEM SALDO";
  if(typeof store.saldo === "number" && store.saldo < 100) return "ATENÇÃO";
  return "OK";
}

export function priorityOf(store){
  // lower = higher priority in sorting
  if(store.saldo === null) return 0;
  if(typeof store.saldo === "number" && store.saldo < 100) return 1;
  return 2;
}

export function sortStores(stores){
  return [...stores].sort((a,b) => {
    const pa = priorityOf(a);
    const pb = priorityOf(b);
    if(pa !== pb) return pa - pb;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

// -------- API helpers --------
export async function apiHealth(){
  const r = await fetch("/api/health", { cache: "no-store" });
  return r.ok;
}

export async function apiLoadState(){
  const r = await fetch("/api/state", { cache: "no-store" });
  if(!r.ok) throw new Error(`GET /api/state ${r.status}`);
  const st = await r.json();
  return normalizeState(st);
}

export async function apiSaveState(state, baseVersion=null){
  const headers = { "Content-Type": "application/json" };
  if(baseVersion !== null && baseVersion !== undefined){
    headers["x-base-version"] = String(baseVersion);
  }
  const r = await fetch("/api/state", {
    method: "PUT",
    headers,
    body: JSON.stringify(state)
  });
  if(r.status === 409){
    const detail = await r.json().catch(()=>({}));
    const err = new Error("CONFLICT");
    err.code = "CONFLICT";
    err.detail = detail;
    throw err;
  }
  if(!r.ok) throw new Error(`PUT /api/state ${r.status}`);
  return await r.json().catch(()=>({ ok:true }));
}
export async function apiSaveStateKeepalive(state, baseVersion=null){
  const headers = { "Content-Type": "application/json" };
  if(baseVersion !== null && baseVersion !== undefined){
    headers["x-base-version"] = String(baseVersion);
  }
  const r = await fetch("/api/state", {
    method: "PUT",
    headers,
    body: JSON.stringify(state),
    keepalive: true
  });
  // keepalive não garante leitura da resposta; mas tentamos detectar conflito
  if(r.status === 409){
    const err = new Error("CONFLICT");
    err.code = "CONFLICT";
    throw err;
  }
  if(!r.ok) throw new Error(`PUT /api/state ${r.status}`);
}


export async function apiResetAll(){
  const r = await fetch("/api/reset", { method: "POST" });
  if(!r.ok) throw new Error(`POST /api/reset ${r.status}`);
}

export async function apiLoadHistory(){
  const r = await fetch("/api/history", { cache: "no-store" });
  if(!r.ok) throw new Error(`GET /api/history ${r.status}`);
  return await r.json(); // { events: [...] }
}

export async function apiAppendEvent(event){
  const r = await fetch("/api/history/append", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event)
  });
  if(!r.ok) throw new Error(`POST /api/history/append ${r.status}`);
}

// UI meta labels
export function setApiLabel(t){ document.getElementById("apiLabel").textContent = t; }

export function updateMetaLabels(state){
  const now = new Date();
  const nowLabel = `${dateKeyLocal(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  document.getElementById("nowLabel").textContent = nowLabel;

  const last = state?.meta?.lastGlobalRunAt ? new Date(state.meta.lastGlobalRunAt) : null;
  document.getElementById("lastRunLabel").textContent =
    last ? `${dateKeyLocal(last)} ${pad2(last.getHours())}:${pad2(last.getMinutes())}` : "—";

  document.getElementById("nextRunLabel").textContent = nextRunLabel(now);
}

export function newEvent(type, payload){
  return {
    id: (crypto?.randomUUID?.() || Math.random().toString(16).slice(2)) + "-" + Date.now(),
    type,
    ts: new Date().toISOString(),
    payload
  };
}


// -------- Modal (confirmações) --------
function ensureModalStyles(){
  if(document.getElementById("modalStyles")) return;
  const s = document.createElement("style");
  s.id = "modalStyles";
  s.textContent = `
  .modalOverlay{ position:fixed; inset:0; background: rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:16px; z-index:9999;}
  .modalBox{ width:min(520px, 100%); background: #121218; border:1px solid rgba(255,255,255,.08); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.55); overflow:hidden;}
  .modalHead{ padding:14px 14px 10px; border-bottom:1px solid rgba(255,255,255,.08);}
  .modalTitle{ margin:0; font-size:14px; letter-spacing:.2px;}
  .modalBody{ padding:12px 14px; color:#a9a9b3; font-size:12px; line-height:1.6;}
  .modalBody strong{ color:#e8e8ee; }
  .modalBtns{ padding:12px 14px 14px; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; border-top:1px solid rgba(255,255,255,.08);}
  `;
  document.head.appendChild(s);
}

export function modalDialog({ title="Confirmar", messageHtml="", buttons=[{label:"Cancelar", value:false},{label:"Confirmar", value:true, variant:"primary"}] }){
  ensureModalStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modalOverlay";
    overlay.addEventListener("click", (e)=>{ if(e.target === overlay) close(buttons[0]?.value ?? false); });

    const box = document.createElement("div");
    box.className = "modalBox";

    const head = document.createElement("div");
    head.className = "modalHead";
    const h = document.createElement("h3");
    h.className = "modalTitle";
    h.textContent = title;
    head.appendChild(h);

    const body = document.createElement("div");
    body.className = "modalBody";
    body.innerHTML = messageHtml || "";

    const btns = document.createElement("div");
    btns.className = "modalBtns";

    const close = (val) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(val);
    };

    const onKey = (ev) => {
      if(ev.key === "Escape") close(buttons[0]?.value ?? false);
      if(ev.key === "Enter") {
        const primary = buttons.find(b => b.variant === "primary") || buttons[buttons.length-1];
        close(primary?.value ?? true);
      }
    };
    document.addEventListener("keydown", onKey);

    for(const b of buttons){
      const btn = document.createElement("button");
      btn.className = "btn";
      if(b.variant === "primary") btn.classList.add("btn--primary");
      if(b.variant === "danger") btn.classList.add("btn--danger");
      btn.textContent = b.label;
      btn.addEventListener("click", ()=> close(b.value));
      btns.appendChild(btn);
    }

    box.appendChild(head);
    box.appendChild(body);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // focus first button
    const firstBtn = btns.querySelector("button");
    if(firstBtn) firstBtn.focus();
  });
}

export function confirmChange({title, lines, confirmLabel="Confirmar"}){
  const html = (lines || []).map(l => `<div>${l}</div>`).join("");
  return modalDialog({
    title,
    messageHtml: html,
    buttons: [
      {label:"Cancelar", value:false},
      {label:confirmLabel, value:true, variant:"primary"}
    ]
  });
}

export function conflictDialog(){
  return modalDialog({
    title: "Conflito detectado",
    messageHtml: `<div>Os dados no servidor foram alterados por outra aba/usuário.</div>
<div><strong>Recarregar do servidor</strong> para evitar sobrescrever.</div>`,
    buttons: [
      {label:"Cancelar", value:"cancel"},
      {label:"Recarregar do servidor", value:"reload", variant:"primary"}
    ]
  });
}


// -------- Loading overlay --------
let _loadingCount = 0;

function ensureLoadingOverlay(){
  if(document.getElementById("loadingOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "loadingOverlay";
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:9998;
    background: rgba(0,0,0,.55);
    display:none; align-items:center; justify-content:center;
    padding: 16px;
    backdrop-filter: blur(6px);
  `;
  const box = document.createElement("div");
  box.style.cssText = `
    width:min(420px, 100%);
    background: #121218;
    border:1px solid rgba(255,255,255,.08);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,.55);
    padding: 14px 14px;
    display:flex; gap:12px; align-items:center;
  `;
  const spinner = document.createElement("div");
  spinner.style.cssText = `
    width:18px; height:18px;
    border-radius:999px;
    border: 2px solid rgba(232,232,238,.25);
    border-top-color: rgba(59,130,246,.95);
    animation: spin .9s linear infinite;
  `;
  const text = document.createElement("div");
  text.id = "loadingText";
  text.style.cssText = "font-size:12px; color:#e8e8ee; font-weight:800; letter-spacing:.2px;";
  text.textContent = "Salvando…";

  box.appendChild(spinner);
  box.appendChild(text);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // spinner keyframes
  if(!document.getElementById("loadingSpinStyles")){
    const s = document.createElement("style");
    s.id = "loadingSpinStyles";
    s.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(s);
  }
}

export function showLoadingOverlay(message="Salvando…"){
  ensureLoadingOverlay();
  _loadingCount++;
  const el = document.getElementById("loadingOverlay");
  const txt = document.getElementById("loadingText");
  if(txt) txt.textContent = message;
  if(el) el.style.display = "flex";
}

export function hideLoadingOverlay(){
  _loadingCount = Math.max(0, _loadingCount - 1);
  if(_loadingCount > 0) return;
  const el = document.getElementById("loadingOverlay");
  if(el) el.style.display = "none";
}
