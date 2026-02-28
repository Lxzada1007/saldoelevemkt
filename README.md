# Saldo System (3 páginas + Cards mobile + Histórico + Cron)

## Páginas
- `index.html` -> Lista de Saldo (somente lista, ordena SEM SALDO/ATENÇÃO/OK, editar e remover)
- `config.html` -> Configuração (importar lista, recarregar, resetar)
- `historico.html` -> Histórico (débitos do cron + alterações)

## Persistência
Vercel Blob:
- `saldo/state.json`
- `saldo/history.json`

## Cron (Vercel)
Este projeto inclui `vercel.json` com:
- `/api/cron/daily` todo dia às 08:00.

### Timezone
Por padrão usamos `America/Sao_Paulo`. Você pode definir:
- `CRON_TZ=America/Sao_Paulo`

### Segurança (opcional, recomendado)
Defina:
- `CRON_SECRET=uma_senha_qualquer`

E configure o Cron do Vercel para enviar o header:
- `x-cron-secret: <CRON_SECRET>`

(Se não definir CRON_SECRET, o endpoint aceita sem header.)

## Env vars obrigatórias
- `BLOB_READ_WRITE_TOKEN` (já configurado no seu projeto)

## Observações
- Em mobile, a Lista de Saldo aparece em **cards**.
- Em desktop, aparece em **tabela**.
