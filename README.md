# Lista de Saldo (Supabase)

Este projeto usa **Supabase Postgres** como banco (mais rápido e estável que Blob).

## 1) Configurar Supabase

1. Crie um projeto no Supabase.
2. Abra o **SQL Editor** e execute o arquivo `SUPABASE_SCHEMA.sql` (na raiz do projeto).

## 2) Variáveis de ambiente (Vercel)

Configure em **Project → Settings → Environment Variables**:

- `SUPABASE_URL` (Project Settings → API)
- `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → service_role **(NUNCA no frontend)**)
- `AUTH_SECRET` (qualquer string forte para assinar o cookie de login)
- `CRON_SECRET` (opcional, recomendado) — usado para proteger `/api/cron/daily`

## 3) Cron (débito diário às 08:00)

O débito diário roda no servidor via Vercel Cron chamando `/api/cron/daily`.

> Se você usar `CRON_SECRET`, configure o header `x-cron-secret` no cron (no `vercel.json` do projeto).

## Observações
- O histórico salva **quem** fez (Lucas/Mateus) e o cron salva como `cron`.
- Conflitos agora são por **loja** (campo `storeVersion`), então editar várias lojas seguidas não “apaga” alterações anteriores.
