import { showLoadingOverlay, hideLoadingOverlay } from "./app-core.js";

const msgEl = document.getElementById("msg");

function setMsg(t){ msgEl.textContent = t || ""; }

async function boot(){
  // if already logged, go to saldo
  try{
    const r = await fetch("/api/me", { cache: "no-store" });
    if(r.ok){
      const me = await r.json();
      if(me?.ok) location.href = "index.html";
    }
  } catch {}

  document.getElementById("loginBtn").addEventListener("click", async () => {
    const user = document.getElementById("user").value;
    const pass = document.getElementById("pass").value;
    const remember = document.getElementById("remember").checked;

    showLoadingOverlay("Entrando…");
    setMsg("");
    try{
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ user, pass, remember })
      });
      if(!r.ok){
        setMsg("Usuário ou senha inválidos.");
        return;
      }
      location.href = "index.html";
    } catch(e){
      console.error(e);
      setMsg("Falha ao conectar.");
    } finally {
      hideLoadingOverlay();
    }
  });
}
boot();
