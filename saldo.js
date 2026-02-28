import {
  apiHealth, apiLoadState, apiUpdateStoreField, apiRemoveStore, apiAppendEvent,
  updateMetaLabels, setApiLabel,
  parseMoneyLoose, moneyToInputValue,
  statusOf, sortStores, newEvent,
  confirmChange, conflictDialog, showLoadingOverlay, hideLoadingOverlay
, requireAuth, apiLogout } from "./app-core.js";


function fmt(v){
  if(v === null || v === undefined) return "SEM SALDO";
  const n = Number(v);
  if(!Number.isFinite(n)) return "SEM SALDO";
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(n);
}

async function patchWithConflict(actionName, fn){
  showLoadingOverlay(actionName);
  try{
    const baseV = state?.meta?.version ?? 0;
    const resp = await fn();
    if(resp && typeof resp.version === "number") state.meta.version = resp.version;
    setApiLabel("OK");
    return { ok:true, resp };
  } catch(e){
    console.error(e);

    if(e?.code === "CONFLICT"){
      // 1) tenta resolver automaticamente uma única vez: recarrega e tenta novamente
      try{
        state = await apiLoadState();
        render();

        const resp2 = await fn();
        if(resp2 && typeof resp2.version === "number") state.meta.version = resp2.version;
        setApiLabel("OK");
        return { ok:true, resp: resp2, retried:true };
      } catch(e2){
        console.error(e2);
        setApiLabel("CONFLITO");
      }

      // 2) se ainda conflitar, pergunta o que fazer (sem travar em overlay)
      hideLoadingOverlay();
      const choice = await conflictDialog();
      if(choice === "reload"){
        try{ state = await apiLoadState(); render(); } catch(err){ console.error(err); }
      }
      return { ok:false, conflict:true };
    }

    setApiLabel("ERRO ao salvar");
    return { ok:false, error:true };
  } finally {
    // garante que o overlay fecha mesmo se tiver modal
    hideLoadingOverlay();
  }
}


let state = { stores: [], meta: { lastGlobalRunAt: null } };
let saving = false;
let pendingSave = false;

function setMsg(text){ /* no msg on this page */ }

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
    if(ev.key === "Enter"){
      ev.preventDefault();
      ev.stopPropagation();
      // blur dispara a confirmação
      input.blur();
    }
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
      const next = (parsed.kind === "null") ? null : parsed.value;

      // nada mudou
      const a = (old === null) ? null : Number(old);
      const b = (next === null) ? null : Number(next);
      if(a === b){
        input.value = (store.saldo === null ? "SEM SALDO" : moneyToInputValue(store.saldo));
        return;
      }

      let ok = false;
      try{
        ok = await confirmChange({
        title: "Confirmar alteração de saldo",
        lines: [
          `Loja: <strong>${store.nome}</strong>`,
          `De: <strong>${old === null ? "SEM SALDO" : fmt(old)}</strong>`,
          `Para: <strong>${next === null ? "SEM SALDO" : fmt(next)}</strong>`
        ]
      });
      } catch(e){
        console.error(e);
        ok = window.confirm(`Confirmar alteração?`);
      }

      if(!ok){
        input.value = (store.saldo === null ? "SEM SALDO" : moneyToInputValue(store.saldo));
        return;
      }

      const result = await patchWithConflict("Salvando saldo…", (baseV) => apiUpdateStoreField({ storeId: store.id, field: "saldo", value: next, storeVersion: store.storeVersion }));
      if(result.ok){
        store.saldo = next;
        if(result.resp?.store?.storeVersion !== undefined) store.storeVersion = result.resp.store.storeVersion;
      }
    } else {
      const old = store.orcamentoDiario ?? 0;
      const next = (parsed.kind === "null") ? 0 : parsed.value;

      if(Number(old) === Number(next)){
        input.value = moneyToInputValue(store.orcamentoDiario ?? 0);
        return;
      }

      let ok = false;
      try{
        ok = await confirmChange({
        title: "Confirmar alteração de orçamento diário",
        lines: [
          `Loja: <strong>${store.nome}</strong>`,
          `De: <strong>${fmt(old)}</strong>`,
          `Para: <strong>${fmt(next)}</strong>`
        ]
      });
      } catch(e){
        console.error(e);
        ok = window.confirm(`Confirmar alteração?`);
      }

      if(!ok){
        input.value = moneyToInputValue(store.orcamentoDiario ?? 0);
        return;
      }

      const result = await patchWithConflict("Salvando orçamento…", (baseV) => apiUpdateStoreField({ storeId: store.id, field: "orcamentoDiario", value: next, storeVersion: store.storeVersion }));
      if(result.ok){
        store.orcamentoDiario = next;
        if(result.resp?.store?.storeVersion !== undefined) store.storeVersion = result.resp.store.storeVersion;
      }
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
  let ok = false;
  try{
    ok = await confirmChange({
    title: "Remover loja",
    confirmLabel: "Remover",
    lines: [
      `Tem certeza que deseja remover <strong>${store.nome}</strong>?`,
      `Isso remove da lista (o histórico é mantido).`
    ]
  });
  } catch(e){
    console.error(e);
    ok = window.confirm(`Remover loja?`);
  }
  if(!ok) return;

  const result = await patchWithConflict("Removendo…", (baseV) => apiRemoveStore(store.id, store.storeVersion));
  if(result.ok){
    state.stores = state.stores.filter(s => s.id !== store.id);
      }
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
  const me = await requireAuth();
  if(!me) return;
  document.getElementById('userLabel').textContent = me.user;
  document.getElementById('logoutBtn').addEventListener('click', async ()=>{ await apiLogout(); location.href='login.html'; });
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


  setInterval(() => updateMetaLabels(state), 1000);
}

boot();
