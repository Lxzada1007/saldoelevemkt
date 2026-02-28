import {
  apiHealth, apiLoadState, apiSaveState, apiSaveStateKeepalive, apiResetAll, apiAppendEvent,
  updateMetaLabels, setApiLabel, parseMoneyLoose, slugId, newEvent
} from "./app-core.js";

let state = { stores: [], meta: { lastGlobalRunAt: null } };

function setMsg(text){
  document.getElementById("importMsg").textContent = text || "";
}

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

function upsertFromImport(items){
  let created = 0, updated = 0;
  const byName = new Map(state.stores.map(s => [s.nome.toLowerCase(), s]));

  for(const it of items){
    const existing = byName.get(it.nome.toLowerCase());
    if(existing){
      existing.saldo = it.saldo; // sobrescreve saldo
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
  updateMetaLabels(state);

  document.getElementById("importBtn").addEventListener("click", async () => {
    const text = document.getElementById("importText").value;
    const items = parseImportedList(text);
    if(items.length === 0){
      setMsg("Nada para importar. Cole sua lista no campo acima.");
      return;
    }
    const { created, updated } = upsertFromImport(items);

    try{
      setApiLabel("Salvando...");
      await apiSaveState(state);
      setApiLabel("OK");
      apiAppendEvent(newEvent("import", { created, updated, totalLines: items.length }));
      setMsg(`Importação concluída: ${updated} atualizadas, ${created} novas.`);
    } catch(e){
      console.error(e);
      setApiLabel("ERRO ao salvar");
      setMsg("Falha ao salvar no servidor.");
    }
  });

  document.getElementById("reloadBtn").addEventListener("click", async () => {
    try{
      state = await apiLoadState();
      setApiLabel("OK");
      setMsg("Recarregado do servidor.");
      updateMetaLabels(state);
    } catch(e){
      console.error(e);
      setApiLabel("OFF");
      setMsg("Falha ao recarregar do servidor.");
    }
  });

  document.getElementById("resetBtn").addEventListener("click", async () => {
    const ok = confirm("Tem certeza? Isso vai apagar ESTADO e HISTÓRICO.");
    if(!ok) return;
    try{
      await apiResetAll();
      setApiLabel("OK");
      state = { stores: [], meta: { lastGlobalRunAt: null } };
      updateMetaLabels(state);
      apiAppendEvent(newEvent("reset", { by: "user" }));
      setMsg("Reset concluído.");
    } catch(e){
      console.error(e);
      setApiLabel("ERRO");
      setMsg("Falha ao resetar.");
    }
  });

  window.addEventListener("beforeunload", () => {
    try{ apiSaveStateKeepalive(state); } catch(e) {}
  });

  setInterval(() => updateMetaLabels(state), 1000);
}

boot();
