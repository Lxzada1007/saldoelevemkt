import {
  apiHealth, apiLoadState, apiSaveState, apiSaveStateKeepalive, apiAppendEvent,
  updateMetaLabels, setApiLabel,
  parseMoneyLoose, moneyToInputValue, slugId,
  statusOf, sortStores, newEvent
} from "./app-core.js";

let state = { stores: [], meta: { lastGlobalRunAt: null } };
let saving = false;
let pendingSave = false;

function setMsg(text){ /* no msg on this page */ }

async function flushSave(){
  setApiLabel("Salvando...");
  if(saving) { pendingSave = true; return; }
  saving = true;
  try{
    await apiSaveState(state);
    setApiLabel("OK");
  } catch(e){
    console.error(e);
    setApiLabel("ERRO ao salvar");
  } finally {
    saving = false;
    if(pendingSave){ pendingSave = false; flushSave(); }
  }
}

function badgeHTML(store){
  const st = statusOf(store);
  if(st === "SEM SALDO") return '<span class="badge badge--danger">SEM SALDO</span>';
  if(st === "ATENÇÃO") return '<span class="badge badge--warn">ATENÇÃO</span>';
  return '<span class="badge badge--none">OK</span>';
}

function rowClass(store){
  const st = statusOf(store);
  if(st === "SEM SALDO") return "row--danger";
  if(st === "ATENÇÃO") return "row--warn";
  return "";
}
function cardClass(store){
  const st = statusOf(store);
  if(st === "SEM SALDO") return "storeCard storeCard--danger";
  if(st === "ATENÇÃO") return "storeCard storeCard--warn";
  return "storeCard";
}

function makeEditableInput(store, field){
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
    if(ev.key === "Enter"){ input.blur(); }
  });

  input.addEventListener("blur", async () => {
    const parsed = parseMoneyLoose(input.value);
    if(parsed.kind === "invalid"){
      input.classList.add("invalid");
      input.value = isSaldo
        ? (store.saldo === null ? "SEM SALDO" : moneyToInputValue(store.saldo))
        : moneyToInputValue(store.orcamentoDiario ?? 0);
      return;
    }

    if(isSaldo){
      const old = store.saldo;
      store.saldo = (parsed.kind === "null") ? null : parsed.value;
      await flushSave();
      await logIfChangedSaldo(store, old, store.saldo);
    } else {
      const old = store.orcamentoDiario ?? 0;
      const v = (parsed.kind === "null") ? 0 : parsed.value;
      store.orcamentoDiario = v;
      await flushSave();
      await logIfChangedBudget(store, old, v);
    }
    render();
  });

  return input;
}

async function logIfChangedBudget(store, oldV, newV){
  if(Number(oldV) === Number(newV)) return;
  try{
    apiAppendEvent(newEvent("budget_change", {
      storeId: store.id, storeName: store.nome,
      from: oldV, to: newV
    }));
  } catch(e){ console.error(e); }
}

async function logIfChangedSaldo(store, oldV, newV){
  const a = (oldV === null) ? null : Number(oldV);
  const b = (newV === null) ? null : Number(newV);
  if(a === b) return;
  try{
    apiAppendEvent(newEvent("saldo_change", {
      storeId: store.id, storeName: store.nome,
      from: oldV, to: newV,
      source: "manual"
    }));
  } catch(e){ console.error(e); }
}

async function removeStore(store){
  const ok = confirm(`Remover a loja "${store.nome}"?`);
  if(!ok) return;
  state.stores = state.stores.filter(s => s.id !== store.id);
  await flushSave();
  try{
    apiAppendEvent(newEvent("store_removed", { storeId: store.id, storeName: store.nome }));
  } catch(e){ console.error(e); }
  render();
}

function renderTable(stores){
  const tbody = document.getElementById("tbody");
  if(!tbody) return;
  tbody.innerHTML = "";

  for(const store of stores){
    const tr = document.createElement("tr");
    tr.className = rowClass(store);

    const tdName = document.createElement("td");
    tdName.textContent = store.nome;

    const tdSaldo = document.createElement("td");
    tdSaldo.className = "right";
    const wrapSaldo = document.createElement("div");
    wrapSaldo.style.display = "flex";
    wrapSaldo.style.gap = "8px";
    wrapSaldo.style.justifyContent = "flex-end";
    wrapSaldo.style.alignItems = "center";
    const prefixS = document.createElement("span");
    prefixS.className = "muted";
    prefixS.style.fontSize = "12px";
    prefixS.textContent = (store.saldo === null) ? "" : "R$";
    wrapSaldo.appendChild(prefixS);
    wrapSaldo.appendChild(makeEditableInput(store, "saldo"));
    tdSaldo.appendChild(wrapSaldo);

    const tdOrc = document.createElement("td");
    tdOrc.className = "right";
    const wrapOrc = document.createElement("div");
    wrapOrc.style.display = "flex";
    wrapOrc.style.gap = "8px";
    wrapOrc.style.justifyContent = "flex-end";
    wrapOrc.style.alignItems = "center";
    const prefixO = document.createElement("span");
    prefixO.className = "muted";
    prefixO.style.fontSize = "12px";
    prefixO.textContent = "R$";
    wrapOrc.appendChild(prefixO);
    wrapOrc.appendChild(makeEditableInput(store, "orcamentoDiario"));
    tdOrc.appendChild(wrapOrc);

    const tdStatus = document.createElement("td");
    tdStatus.className = "center";
    tdStatus.innerHTML = badgeHTML(store);

    const tdActions = document.createElement("td");
    tdActions.className = "center";
    const btn = document.createElement("button");
    btn.className = "btn btn--danger";
    btn.textContent = "Remover";
    btn.addEventListener("click", () => removeStore(store));
    tdActions.appendChild(btn);

    tr.appendChild(tdName);
    tr.appendChild(tdSaldo);
    tr.appendChild(tdOrc);
    tr.appendChild(tdStatus);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }
}

function renderCards(stores){
  const cards = document.getElementById("cards");
  if(!cards) return;
  cards.innerHTML = "";

  for(const store of stores){
    const card = document.createElement("div");
    card.className = cardClass(store);

    const top = document.createElement("div");
    top.className = "storeCard__top";

    const name = document.createElement("div");
    name.className = "storeName";
    name.textContent = store.nome;

    const status = document.createElement("div");
    status.innerHTML = badgeHTML(store);

    top.appendChild(name);
    top.appendChild(status);

    const fields = document.createElement("div");
    fields.className = "cardFields";

    const saldoRow = document.createElement("div");
    saldoRow.className = "fieldRow";
    const saldoLabel = document.createElement("label");
    saldoLabel.textContent = "Saldo";
    const saldoWrap = document.createElement("div");
    saldoWrap.style.display = "flex";
    saldoWrap.style.gap = "8px";
    saldoWrap.style.alignItems = "center";
    const saldoPrefix = document.createElement("span");
    saldoPrefix.className = "muted";
    saldoPrefix.style.fontSize = "12px";
    saldoPrefix.textContent = (store.saldo === null) ? "" : "R$";
    saldoWrap.appendChild(saldoPrefix);
    saldoWrap.appendChild(makeEditableInput(store, "saldo"));
    saldoRow.appendChild(saldoLabel);
    saldoRow.appendChild(saldoWrap);

    const orcRow = document.createElement("div");
    orcRow.className = "fieldRow";
    const orcLabel = document.createElement("label");
    orcLabel.textContent = "Orçamento diário";
    const orcWrap = document.createElement("div");
    orcWrap.style.display = "flex";
    orcWrap.style.gap = "8px";
    orcWrap.style.alignItems = "center";
    const orcPrefix = document.createElement("span");
    orcPrefix.className = "muted";
    orcPrefix.style.fontSize = "12px";
    orcPrefix.textContent = "R$";
    orcWrap.appendChild(orcPrefix);
    orcWrap.appendChild(makeEditableInput(store, "orcamentoDiario"));
    orcRow.appendChild(orcLabel);
    orcRow.appendChild(orcWrap);

    fields.appendChild(saldoRow);
    fields.appendChild(orcRow);

    const actions = document.createElement("div");
    actions.className = "cardActions";
    const rm = document.createElement("button");
    rm.className = "btn btn--danger";
    rm.textContent = "Remover";
    rm.addEventListener("click", () => removeStore(store));
    actions.appendChild(rm);

    card.appendChild(top);
    card.appendChild(fields);
    card.appendChild(actions);

    cards.appendChild(card);
  }
}

function render(){
  updateMetaLabels(state);
  const sorted = sortStores(state.stores.filter(s => s.ativa !== false));
  renderTable(sorted);
  renderCards(sorted);
}

async function boot(){
  try{
    const ok = await apiHealth();
    setApiLabel(ok ? "OK" : "OFF");
  } catch { setApiLabel("OFF"); }

  try{
    state = await apiLoadState();
  } catch(e){
    console.error(e);
    state = { stores: [], meta: { lastGlobalRunAt: null } };
  }
  render();

  // garante persistência mesmo se recarregar logo após editar
  window.addEventListener("beforeunload", () => {
    try{ apiSaveStateKeepalive(state); } catch(e) {}
  });

  setInterval(() => updateMetaLabels(state), 1000);
}

boot();
