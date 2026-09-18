# Lota Online

Juega a la **lota chilena** en linea con tus amigos: salas publicas o privadas de hasta 10
jugadores, locutor que canta los numeros, monedas y cosmeticos.

## Desarrollo local

```bash
pnpm install
cp .env.example apps/server/.env   # opcional: hay valores por defecto de desarrollo
pnpm db:up                         # Postgres 16 en Docker (requiere Docker Desktop corriendo)
pnpm db:migrate
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/health

## Despliegue

Un unico Web Service en **Render** (runtime Node 22, sin Docker) sirve la SPA, la API y
Socket.IO desde el mismo origen, contra **Neon** (Postgres serverless) en la misma region.
El blueprint esta en [`render.yaml`](./render.yaml); los pasos manuales de la primera puesta en
marcha se documentaran en `DEPLOY.md` al llegar a la Fase 7.

Ver [`CLAUDE.md`](./CLAUDE.md) para comandos y convenciones, y [`PLAN.md`](./PLAN.md) para el
plan de producto completo.
