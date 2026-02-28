import {
  apiHealth, apiLoadState, apiApplyImport, apiResetAll, apiAppendEvent,
  updateMetaLabels, setApiLabel, parseMoneyLoose, slugId, newEvent, confirmChange, conflictDialog, showLoadingOverlay, hideLoadingOverlay
, requireAuth, apiLogout } from "./app-core.js";

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
  updateMetaLabels(state);

  document.getElementById("importBtn").addEventListener("click", async () => {
    const text = document.getElementById("importText").value;
    const items = parseImportedList(text);
    if(items.length === 0){
      setMsg("Nada para importar. Cole sua lista no campo acima.");
      return;
    }
    const { created, updated } = upsertFromImport(items);

    // Importação é crítica: confirma e só depois aplica no servidor.
    // Overlay trava a UI e sempre é fechado no finally.
    showLoadingOverlay("Confirmando importação…");
    try{
      const okConfirm = await confirmChange({
        title: "Confirmar importação",
        lines: [
          `Você vai aplicar a importação no servidor.`,
          `Atualizadas: <strong>${updated}</strong> | Novas: <strong>${created}</strong>`
        ]
      });

      if(!okConfirm){
        setMsg("Importação cancelada.");
        return;
      }

      setApiLabel("Salvando...");
      showLoadingOverlay("Aplicando importação…");
      try{
        const resp = await apiApplyImport(items, state?.meta?.version ?? 0);
        if(resp && typeof resp.version === "number") state.meta.version = resp.version;

        // Recarrega para refletir ids/versões do servidor
        state = await apiLoadState();
        updateMetaLabels(state);

        setApiLabel("OK");
        const u = (resp?.updated ?? updated);
        const c = (resp?.created ?? created);
        setMsg(`Importação concluída: ${u} atualizadas, ${c} novas.`);
      } catch(e){
        if(e?.code === "CONFLICT"){
          // fecha overlay antes do modal para não travar
          hideLoadingOverlay();
          const choice = await conflictDialog();
          if(choice === "reload"){
            state = await apiLoadState();
            updateMetaLabels(state);
            setMsg("Conflito detectado. Recarreguei do servidor. Tente importar novamente.");
            return;
          }
          // se não recarregar, só aborta a importação
          setMsg("Conflito detectado. Importação não aplicada.");
          return;
        }
        throw e;
      }
});

  document.getElementById("reloadBtn").addEventListener("click", async () => {
    showLoadingOverlay("Recarregando…");
    try{
      state = await apiLoadState();
      setApiLabel("OK");
      setMsg("Recarregado do servidor.");
      updateMetaLabels(state);
    } catch(e){
      console.error(e);
      setApiLabel("OFF");
      setMsg("Falha ao recarregar do servidor.");
    } finally {
      hideLoadingOverlay();
    }
  });

  document.getElementById("resetBtn").addEventListener("click", async () => {
    const ok = await confirmChange({
      title: "Resetar Blob",
      confirmLabel: "Resetar",
      lines: [
        "Tem certeza?",
        "<strong>Isso vai apagar ESTADO e HISTÓRICO.</strong>"
      ]
    });
    if(!ok) return;
    try{
      await apiResetAll();
      setApiLabel("OK");
      state = { stores: [], meta: { lastGlobalRunAt: null } };
      updateMetaLabels(state);
      apiAppendEvent(newEvent("reset", { by: "user" }));
      setMsg("Reset concluído.");
      hideLoadingOverlay();
    } catch(e){
      console.error(e);
      setApiLabel("ERRO");
      setMsg("Falha ao resetar.");
      hideLoadingOverlay();
    }
  });

    setInterval(() => updateMetaLabels(state), 1000);
}

boot();
