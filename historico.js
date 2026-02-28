import {
  apiHealth, apiLoadState, apiLoadHistory,
  updateMetaLabels, setApiLabel
, requireAuth, apiLogout } from "./app-core.js";

let state = { stores: [], meta: { lastGlobalRunAt: null } };
let history = { events: [] };

function typeLabel(t){
  switch(t){
    case "debit": return "💸 Débito diário";
    case "budget_change": return "✏️ Mudança de orçamento";
    case "saldo_change": return "📝 Mudança de saldo";
    case "import": return "📥 Importação";
    case "store_removed": return "🗑 Remoção de loja";
    case "reset": return "♻️ Reset";
    default: return t;
  }
}

function formatTs(iso){
  try{
    const d = new Date(iso);
    const pad2 = (n) => String(n).padStart(2,"0");
    return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch { return iso; }
}

function renderStoreOptions(){
  const sel = document.getElementById("filterStore");
  sel.innerHTML = '<option value="">Todas as lojas</option>';
  const stores = [...state.stores].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  for(const s of stores){
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.nome;
    sel.appendChild(o);
  }
}

function matchesFilters(ev){
  const t = document.getElementById("filterType").value;
  const s = document.getElementById("filterStore").value;

  if(t && ev.type !== t) return false;
  const storeId = ev?.payload?.storeId;
  if(s && storeId !== s) return false;
  return true;
}

function render(){
  const list = document.getElementById("historyList");
  list.innerHTML = "";

  const events = [...(history.events || [])]
    .filter(matchesFilters)
    .sort((a,b)=> new Date(b.ts) - new Date(a.ts));

  for(const ev of events){
    const card = document.createElement("div");
    card.className = "storeCard";

    const top = document.createElement("div");
    top.className = "storeCard__top";

    const title = document.createElement("div");
    title.className = "storeName";
    title.textContent = typeLabel(ev.type);

    const ts = document.createElement("div");
    ts.className = "muted small";
    ts.textContent = formatTs(ev.ts);

    top.appendChild(title);
    top.appendChild(ts);

    const body = document.createElement("div");
    body.className = "muted small";
    body.style.marginTop = "10px";
    body.style.lineHeight = "1.6";

    const p = ev.payload || {};
    let lines = [];

    if(ev.actor) lines.push(`Por: <strong>${escapeHtml(ev.actor)}</strong>`);
    if(p.storeName) lines.push(`Loja: <strong>${escapeHtml(p.storeName)}</strong>`);
    if(ev.type === "debit"){
      lines.push(`Data: ${escapeHtml(p.dateKey || "")}`);
      lines.push(`Orçamento: ${fmt(p.budget)} | Saldo: ${fmt(p.before)} → ${fmt(p.after)}`);
      if(p.result) lines.push(`Resultado: <strong>${escapeHtml(p.result)}</strong>`);
    }
    if(ev.type === "budget_change"){
      lines.push(`Orçamento: ${fmt(p.from)} → ${fmt(p.to)}`);
    }
    if(ev.type === "saldo_change"){
      lines.push(`Saldo: ${fmt(p.from)} → ${fmt(p.to)}`);
      if(p.source) lines.push(`Fonte: ${escapeHtml(p.source)}`);
    }
    if(ev.type === "import"){
      lines.push(`Atualizadas: ${p.updated ?? 0} | Novas: ${p.created ?? 0} | Linhas: ${p.totalLines ?? 0}`);
    }
    if(ev.type === "store_removed"){
      lines.push(`Removida do sistema.`);
    }
    if(ev.type === "reset"){
      lines.push(`Reset do estado/histórico.`);
    }

    body.innerHTML = lines.map(l=>`<div>${l}</div>`).join("") || "<div>(sem detalhes)</div>";

    card.appendChild(top);
    card.appendChild(body);
    list.appendChild(card);
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}
function fmt(v){
  if(v === null || v === undefined) return "SEM SALDO";
  const n = Number(v);
  if(!Number.isFinite(n)) return "SEM SALDO";
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(n);
}

async function reload(){
  try{
    state = await apiLoadState();
    updateMetaLabels(state);
    renderStoreOptions();
  } catch(e){ console.error(e); }

  try{
    history = await apiLoadHistory();
    render();
  } catch(e){
    console.error(e);
  }
}

async function boot(){
  const me = await requireAuth();
  if(!me) return;
  document.getElementById('userLabel').textContent = me.user;
  document.getElementById('logoutBtn').addEventListener('click', async ()=>{ await apiLogout(); location.href='login.html'; });
  try{
    const ok = await apiHealth();
    setApiLabel(ok ? "OK" : "OFF");
  } catch { setApiLabel("OFF"); }

  await reload();

  document.getElementById("refreshHistoryBtn").addEventListener("click", reload);
  document.getElementById("filterType").addEventListener("change", render);
  document.getElementById("filterStore").addEventListener("change", render);

  setInterval(() => updateMetaLabels(state), 1000);
}

boot();
