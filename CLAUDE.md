# CLAUDE.md — Lota Online

Monorepo del juego de **lota chilena** en linea. El plan completo del producto esta en
[`PLAN.md`](./PLAN.md): leelo antes de tomar decisiones de arquitectura o de producto.
El despliegue (Render + Neon) esta detallado en la seccion 12 de ese documento.

## Estructura

```
apps/web/        React 18 + Vite + Tailwind v4 + Zustand  (@lota/web)
apps/server/     Fastify 5 + Socket.IO + Drizzle          (@lota/server)
packages/shared/ Tipos, Zod, eventos y logica pura        (@lota/shared)
render.yaml      Blueprint de Render
.node-version    Node 22 (Render lo respeta)
```

`@lota/shared` se compila con `tsc` a `dist/`. Web y server lo consumen desde ahi, por eso
`pnpm dev` y `pnpm build` lo construyen **primero**. En dev queda un `tsc --watch` encima.

## Comandos

| Comando                             | Que hace                                                            |
| ----------------------------------- | ------------------------------------------------------------------- |
| `pnpm install`                      | Instala todo el workspace                                           |
| `pnpm dev`                          | Compila `shared` y levanta server (:3000) + web (:5173) en paralelo |
| `pnpm build`                        | Build de produccion de los tres paquetes                            |
| `pnpm test`                         | Vitest en todos los paquetes                                        |
| `pnpm typecheck`                    | `tsc --noEmit` en todos los paquetes                                |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                                                              |
| `pnpm format` / `pnpm format:check` | Prettier                                                            |
| `pnpm db:up` / `pnpm db:down`       | Postgres 16 local vía Docker (**solo desarrollo**)                  |
| `pnpm db:generate`                  | Genera una migracion desde `apps/server/src/db/schema.ts`           |
| `pnpm db:migrate`                   | Aplica las migraciones pendientes                                   |

Vite proxea `/api`, `/health` y `/socket.io` (con WebSocket) a `http://localhost:3000`, así que
en desarrollo se trabaja siempre contra `http://localhost:5173`.

## Entorno

Copiar `.env.example` a `apps/server/.env`. El servidor lee el archivo con
`--env-file-if-exists`, así que funciona sin `.env` usando los valores por defecto de desarrollo.
En produccion `SESSION_SECRET` y `DATABASE_URL` son obligatorios y explicitos: el arranque falla
si quedaron en los valores de desarrollo. **Nunca** commitear secretos; `.env` esta en
`.gitignore`.

## Tests

`packages/shared` y `apps/web` corren sin dependencias externas. Los de `apps/server` son de
**integracion contra Postgres de verdad**: levanta la base con `pnpm db:up` antes de `pnpm test`.
Usan una base aparte, `lota_test`, que se crea y migra sola (`apps/server/vitest.global-setup.ts`),
asi que no tocan los datos de desarrollo. Si Postgres no responde, los tests fallan con un
mensaje que lo explica; no se saltan en silencio.

## Autenticacion (Fase 1)

- Contrasenas con **argon2id** (19 MiB, 2 iteraciones, 1 hilo: recomendacion OWASP). Usamos
  `@node-rs/argon2` en vez del paquete `argon2` porque trae binarios precompilados para Windows
  y para Linux: mismo algoritmo, sin cadena de compilacion nativa en local ni en Render.
- Sesion en cookie `httpOnly`, `sameSite=lax`, `secure` solo en produccion. La cookie lleva un
  token de 32 bytes **firmado** con `SESSION_SECRET`; en la tabla `sessions` solo se guarda su
  SHA-256. La firma permite descartar cookies falsas sin consultar la base, algo que importa con
  Neon dormido.
- Las sesiones vencidas se borran al arrancar y una vez al dia, no mas seguido (horas de computo
  de Neon).
- `username` es `citext`: la unicidad y el login ignoran mayusculas. La extension la crea la
  migracion `0001`.
- Login y registro con rate limit de 5 por minuto **por IP + usuario**, para que nadie pueda
  dejar fuera a otro agotandole los intentos. El login responde siempre lo mismo exista o no el
  usuario, y hashea igual cuando no existe para no delatarlo por tiempo de respuesta.

## Logica del juego (Fase 2)

Vive en `packages/shared/src/game/`, sin red ni base de datos, y esta cubierta al 100% por tests
de propiedades sobre 10.000 cartones.

- `generateCard` / `generateUniqueCards` / `cardKey` / `cardNumbers` / `columnRange` / `columnOf`
- `checkLine` / `checkFull` / `findCompletedLine`
- `createBag`

**La aleatoriedad se inyecta**: todas estas funciones reciben un `RandomInt` y no tienen valor
por defecto. Es deliberado por dos razones. Primero, el servidor debe pasar `crypto.randomInt`
(PLAN.md seccion 3): si esto cayera en `Math.random` por descuido, los cartones y el bolillero
serian predecibles. Segundo, mantiene el paquete isomorfico, porque importar `node:crypto` aqui
romperia el bundle del navegador. Para tests hay `createSeededRandomInt`, determinista, que
**no debe usarse en produccion**.

Un carton se construye en tres pasos: cuantos numeros lleva cada columna (1 a 3, sumando 15),
que filas ocupa cada columna (vuelta atras, para que cada fila quede con 5 exactos) y que
numeros concretos van, ordenados de menor a mayor hacia abajo.

## Salas y tiempo real (Fase 3)

Las salas viven **en memoria** detrás de la interfaz `LobbyStore`
(`apps/server/src/lobby/store.ts`), no en la base de datos. Se registran como decorador de
Fastify (`app.lobbies`) en vez de un singleton de módulo, para que cada app de test tenga la
suya. Cambiar a Redis para varias instancias sería reimplementar esa interfaz.

- **Socket.IO se autentica en el handshake** con la misma cookie firmada que la API: sin sesión
  válida no se acepta la conexión. No hay un segundo mecanismo de sesión.
- **Todos los payloads se revalidan con Zod en el servidor**, aunque los tipos de
  `ClientToServerEvents` los describan: eso es ayuda para escribir el cliente, no una garantía.
- **Cada evento contesta con acuse de recibo** (`AckResponse`), así el cliente siempre sabe si su
  acción salió o falló, sin adivinar por el estado que llega después.
- `lobby:state` se manda **socket a socket**, no a la sala entera, porque `yourCards` es distinto
  para cada jugador. La `bag` y los cartones ajenos nunca salen del servidor.
- El mantenimiento (desconectados que pasaron el margen, cambio de anfitrión, salas vacías) es un
  **barrido periódico** en la capa de sockets, no un temporizador por sala: con miles de salas
  serían miles de timers. `barrer()` acepta un reloj para que los tests no esperen de verdad.
- Desconectarse **no** saca del acto: se conserva el sitio 30 s en WAITING y toda la partida en
  PLAYING. Salir con `lobby:leave` sí saca en el momento.
- Cambiar la configuración reinicia los "listo": nadie acepta reglas a ciegas.
- Chat limitado a 1 mensaje por segundo y por socket; solo se guardan los 50 últimos.

## Local vs produccion

|               | Local                        | Produccion (Render)                                              |
| ------------- | ---------------------------- | ---------------------------------------------------------------- |
| Base de datos | Postgres de `docker-compose` | Neon (`aws-us-east-1`)                                           |
| Frontend      | Vite dev server con proxy    | `apps/web/dist` servido por Fastify, con fallback a `index.html` |
| Origen        | dos puertos (5173 / 3000)    | uno solo, sin CORS                                               |
| `trustProxy`  | `false`                      | `true` (Render termina el HTTPS)                                 |
| Variables     | `apps/server/.env`           | panel de Render                                                  |

**Dos cadenas de conexion a Neon**: `DATABASE_URL` con pooler (el host contiene `-pooler`) para
la aplicacion, y `DATABASE_URL_DIRECT` sin pooler para las migraciones, porque PgBouncer en modo
transaccion no soporta todo el DDL. En local basta `DATABASE_URL`.

`/health` **no consulta la base de datos** a proposito: Render la llama seguido y en el plan Free
de Neon la BD duerme. Para diagnostico manual existe `/health/db`.

## Convenciones

- TypeScript `strict: true` más `noUncheckedIndexedAccess`. **Prohibido `any`** salvo con un
  comentario que lo justifique (ESLint lo marca como error).
- Imports de tipo siempre con `import type` (regla `consistent-type-imports`).
- `apps/server` y `packages/shared` usan `moduleResolution: NodeNext`: los imports relativos
  **llevan extension `.js`** aunque el archivo sea `.ts`. `apps/web` usa `Bundler`.
- **Nombres de codigo en ingles; textos de interfaz en espanol de Chile**, centralizados en
  `apps/web/src/i18n/es-CL.ts`. Ningun componente lleva texto literal.
- Constantes de juego y economia viven en `packages/shared` (`constants.ts`, luego
  `economy.ts`). Nunca numeros magicos repartidos por el codigo.
- La logica pura del juego va en `packages/shared/src/game/`, sin red ni BD, testeada al 100%.
- El servidor es la unica autoridad: sorteo, cartones, validacion de lota y monedas. El cliente
  solo muestra.
- El sistema de archivos de Render es efimero: **no escribir nada en disco**.
- Cada deploy o reinicio borra las salas en memoria; el cliente debe manejarlo (ver seccion 12.4
  del plan).
- Tras tocar `src/db/schema.ts`: `pnpm db:generate` y luego `pnpm db:migrate`.

## Flujo de trabajo por fases

`PLAN.md` seccion 13 define las fases. Se trabaja **una fase a la vez**: al terminar, los tests
pasan, se hace commit con mensaje descriptivo y se para para que el usuario revise.

Ante una decision de producto que `PLAN.md` no cubra: **preguntar antes de implementar**.

### Estado actual

- [x] Fase 0 — Andamiaje
- [x] Fase 1 — Autenticacion
- [x] Fase 2 — Logica pura del juego
- [x] Fase 3 — Salas
- [ ] Fase 4 — Partida
- [ ] Fase 5 — Locutor
- [ ] Fase 6 — Economia y tienda
- [ ] Fase 7 — Produccion en Render + Neon
