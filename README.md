# Saldo System (Vercel Blob)

Persistência usando **Vercel Blob** (arquivo JSON no storage do Vercel).

## Configuração no Vercel
1) Adicione **Blob** ao seu projeto no Dashboard.
2) Garanta que a env var `BLOB_READ_WRITE_TOKEN` exista (o Vercel cria automaticamente quando o Blob está no mesmo projeto).

## Rotas
- `GET /api/health`
- `GET /api/state`
- `PUT /api/state` (salva o JSON no blob `saldo/state.json`)
- `POST /api/reset` (zera o estado)

## Observações
- O Blob é melhor tratado como imutável, mas é possível sobrescrever um JSON (usamos `allowOverwrite: true` e `cacheControlMaxAge: 0`).
- O arquivo salvo fica em `saldo/state.json` dentro do Blob Store.


## Nota importante
Este build salva o JSON como **Blob público** (para simplificar a leitura sem precisar de `get()` no SDK). Se você quiser privado com autenticação, eu adapto também.


## Fix: dados sumiam no refresh
Este build salva imediatamente após a importação e também tenta salvar com `keepalive` ao atualizar/fechar a aba.
