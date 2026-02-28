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

export async function apiSaveState(state){
  const r = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
  if(!r.ok) throw new Error(`PUT /api/state ${r.status}`);
}
export async function apiSaveStateKeepalive(state){
  // tenta salvar mesmo durante refresh/fechamento (keepalive)
  const r = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
    keepalive: true
  });
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
