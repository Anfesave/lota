# Estado del proyecto — Lota Online

> Resumen de traspaso. Si estás retomando el proyecto en un chat nuevo, lee esto y
> [`CLAUDE.md`](./CLAUDE.md) (comandos y convenciones). El plan de producto completo está en
> [`PLAN.md`](./PLAN.md).

**Al 19 de septiembre de 2026.** Fases 0 a 6 del plan terminadas. Falta la Fase 7 (producción).

---

## Qué es

Sitio para jugar a la **lota chilena** en línea. Salas públicas o privadas de hasta 20 jugadores,
una gata locutora que canta los números en voz alta, monedas virtuales, tienda de cosméticos y
apuestas entre amigos.

Repositorio: `M:\Proyectos\lota\lota` → `github.com/Anfesave/lota`.
**Los push los hace el usuario con GitHub Desktop**; aquí solo se hacen commits.

## Dónde está cada cosa

```
apps/web/        React 18 + Vite 7 + Tailwind 4 + Zustand   (@lota/web)
apps/server/     Fastify 5 + Socket.IO + Drizzle sobre pg   (@lota/server)
apps/e2e/        Playwright                                 (@lota/e2e)
packages/shared/ Tipos, Zod, lógica pura, constantes        (@lota/shared)
render.yaml      Blueprint de Render
```

## Cómo se corre

```bash
pnpm install
pnpm db:up          # Postgres 16 en Docker: HACE FALTA para los tests del servidor
pnpm db:migrate
pnpm dev            # web :5173, api :3000
pnpm test           # 224 unitarios
pnpm test:e2e       # 2 e2e; compila primero
```

**Estado de los tests: 224 unitarios + 2 e2e, todos en verde.** También `typecheck`, `lint` y
`build`.

---

## Lo que ya funciona

| Fase | Qué quedó                                                                                 |
| ---- | ----------------------------------------------------------------------------------------- |
| 0    | Monorepo pnpm, TS estricto, ESLint, Prettier, Vitest, Docker para Postgres, `render.yaml` |
| 1    | Registro, login, logout, `/api/me`. argon2id, cookie firmada httpOnly, rate limit 5/min   |
| 2    | Lógica pura del juego: cartones, bolillero, validación de línea y lota                    |
| 3    | Salas en memoria, Socket.IO autenticado, chat, expulsar, migración de anfitrión           |
| 4    | Partida completa: cuenta atrás, locutor, marcar, cantar, empates, reconexión              |
| 5    | Locutor por Web Speech API, controles de voz, dichos, bola animada, tablero de 90         |
| 6    | Monedas, tienda de 17 cosméticos, anti-farmeo, bono diario, historial, perfil             |

Más, fuera del plan y pedido por el usuario:

- **Apuestas** entre amigos, de $500 en $500, con pozo y cuentas acumuladas por sala.
- **Aviso emergente** cuando a alguien le quedan 3, 2 o 1 números.
- **Tres gatas loteras** (La Negra, La Rayada, La Colorina), sorteadas por partida.
- El **cartón no resalta** los números cantados: hay que estar atento.

## Decisiones que conviene no deshacer

1. **El servidor es la única autoridad.** Sorteo, cartones, validación y monedas. La aleatoriedad
   se inyecta como `RandomInt` y **no tiene valor por defecto**, para que nadie caiga en
   `Math.random` por descuido. `packages/shared` no importa `node:crypto` y así sigue siendo
   isomórfico.
2. **Las apuestas son un registro, no dinero.** La app anota cuánto puso cada uno y quién se
   llevó el pozo; el arreglo queda entre los jugadores. No hay pasarela de pago. Mover dinero real
   exigiría pasarela y cumplimiento de normativa de juegos de azar: no es un cambio de pantallas.
3. **`users.coins` es un saldo derivado**; la fuente de verdad es `coin_transactions`. Gastar usa
   `update ... where coins >= precio`, así que las carreras las resuelve Postgres.
4. **Las salas viven en memoria** detrás de `LobbyStore`, registrado como decorador de Fastify.
   Migrar a Redis sería reimplementar esa interfaz.
5. **El locutor encadena `setTimeout`**, nunca `setInterval`.
6. **La SPA se sirve cuando existe el build**, no según `NODE_ENV`: en producción las cookies son
   `secure` y no viajarían por el http del e2e.
7. **`@node-rs/argon2`** en vez del paquete `argon2`: mismo algoritmo, con binarios precompilados
   para Windows y Linux.

## Bugs que ya se encontraron y arreglaron

Vale la pena conocerlos para no reintroducirlos:

- El cliente llamaba a `connect()` dos veces al cargar `/sala/<code>` de cero, lo que abría una
  segunda sesión de engine.io y perdía el `lobby:join`. **Los links de invitación no funcionaban.**
- El cliente no acumulaba los números cantados, así que con marcado automático el cartón nunca se
  marcaba y el tablero quedaba vacío.
- Al reconectar se descartaban los números y marcas que devuelve el servidor.
- `cargarSesion` relanzaba un error que nadie atrapaba: un fallo del servidor mandaba al login.
- El auto-scroll del chat tumbaba el componente donde no existe `scrollIntoView`.
- El aviso de lota rechazada se borraba antes de verse.

## Lo que falta

**Fase 7 — Producción en Render + Neon** (sección 12 del plan):

1. Escribir `DEPLOY.md` con los pasos manuales: crear el proyecto en Neon en `aws-us-east-1` con
   cómputo 0,25 CU, copiar las dos cadenas de conexión, conectar el repo en Render como Blueprint,
   pegar las variables `sync: false` y verificar el primer deploy.
2. Reintentos y timeouts contra el scale-to-zero de Neon (parte ya está en `poolConfigFor` y en el
   runner de migraciones).
3. Evento `server:shutdown` → ya emitido; falta comprobarlo contra un reinicio real.
4. Completar el checklist de seguridad de la sección 11.

**Ojo al desplegar:** desde la Fase 1 la aplicación necesita Neon configurado en Render
(`DATABASE_URL` y `DATABASE_URL_DIRECT`), o el arranque falla a propósito. Hay dos migraciones
pendientes de aplicar en producción: `0001` (usuarios y sesiones) y `0002` (economía).

## Cosas menores pendientes

- `packages/shared/src/dichos.ts` está **para que el usuario lo complete**: solo hay ~17 dichos de
  relleno.
- La voz depende de las voces instaladas en el sistema. En el equipo del usuario solo hay `es-ES`.
  Para una voz chilena garantizada, el plan (sección 8) contempla 90 clips pregrabados; la
  interfaz `Announcer` ya está preparada para ese segundo backend.
- Playwright usa el Chrome del sistema (`channel: 'chrome'`) porque la descarga de su Chromium
  falla en esta máquina.
