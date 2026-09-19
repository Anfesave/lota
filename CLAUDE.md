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
- Desconectarse **no** saca del acto: se conserva el sitio **60 s** en WAITING y toda la partida
  en PLAYING. Salir con `lobby:leave` sí saca en el momento.
- **Reconexión desde el teléfono**: cambiar de aplicación suspende la página y cae el socket. El
  cliente vuelve a entrar solo (`salaActual` en el store, reintento en el evento `connect`) y
  empuja la reconexión al volver a primer plano (`visibilitychange`, `focus`, `pageshow`), porque
  los reintentos de socket.io se congelan con la pestaña. Sin esas dos piezas la pantalla se
  quedaba muda aunque el jugador siguiera dentro de la sala.
- Cambiar la configuración reinicia los "listo": nadie acepta reglas a ciegas.
- Chat limitado a 1 mensaje por segundo y por socket; solo se guardan los 50 últimos.

## La partida (Fase 4)

El motor vive en `apps/server/src/game/`, separado en dos piezas: `engine.ts` es lógica pura
sobre el estado de la sala (repartir, sacar número, marcar, validar un canto) y `runner.ts` lleva
los relojes. El runner solo sabe _avisar_; quien manda los eventos por la red es la capa de
sockets, así el motor no depende de Socket.IO.

- El locutor **encadena `setTimeout`**, nunca `setInterval` (PLAN.md 7): así un canto lento no se
  solapa con el siguiente y parar es inmediato.
- Los cantos se validan contra **los números efectivamente cantados**, no contra lo que el
  jugador tenga marcado. Las marcas son cosméticas; el cliente no decide nada.
- **Empates**: la primera lota válida detiene el sorteo y abre una ventana de 1,5 s
  (`TIE_WINDOW_MS`); quien cante bien dentro de ella también gana. Por eso el anuncio lo hace el
  runner al cerrar la ventana, no el manejador del evento.
- Cantar mal cuesta 10 s de bloqueo, para que no se pueda pulsar sin parar.
- `game:numberCalled` es un evento **ligero**: el cliente acumula los números cantados y, con
  marcado automático, marca de su lado. Mandar el estado completo en cada número sería caro.
  `lobby:state` (entrada y reconexión) es lo que resincroniza.
- Al terminar, la sala queda en `FINISHED`, que se comporta como `WAITING`: se puede jugar otra
  sin volver a crearla.

`TEST_CALL_INTERVAL_MS` y `TEST_COUNTDOWN_SECONDS` aceleran la partida para los tests. **Se
ignoran en producción**: nadie debe poder acelerar el sorteo de una partida real.

## El locutor (Fase 5)

`apps/web/src/lib/announcer.ts` define la interfaz `Announcer` con una implementación sobre la
Web Speech API. Está pensada para cambiarla por los 90 clips pregrabados de la sección 8 del plan
sin tocar quien la usa. La voz se elige `es-CL` → `es-419` → `es-*`, en ese orden.

- **iOS no deja sonar nada sin un gesto del usuario**: por eso hay un botón "Activar sonido"
  antes de que aparezcan los controles.
- Volumen y silencio son **locales** y se recuerdan en `localStorage`; no afectan a los demás.
- El número **siempre** se ve en pantalla, aunque el audio esté apagado.
- Los dichos están en `packages/shared/src/dichos.ts`, **pensado para que lo completes**. Se
  activan por sala con el interruptor `dichos`.

## Tests e2e

`apps/e2e` (Playwright) levanta el servidor con la SPA compilada y juega una partida entera entre
dos navegadores. Necesita `pnpm db:up` y se corre con `pnpm test:e2e`, que compila primero.

Usa el Chrome del sistema (`channel: 'chrome'`) porque la descarga del Chromium de Playwright
falla en esta máquina. Para usar el suyo: `pnpm exec playwright install chromium` y quitar
`channel` de `playwright.config.ts`.

La SPA se sirve **cuando existe el build**, no según `NODE_ENV`: en producción las cookies son
`secure` y no viajarían por el http del e2e.

## Economía, apuestas y cosméticos (Fase 6)

Monedas virtuales y cosméticos en `apps/server/src/economy/`. Los números de balance viven en
`packages/shared/src/economy.ts` y el catálogo de cosméticos en `packages/shared/src/cosmetics.ts`,
compartido: el servidor lo usa para sembrar la tabla y el cliente para pintar colores y formas
sin tener que pedirlos.

- `users.coins` es un **saldo derivado**: la fuente de verdad es `coin_transactions`. Cada
  movimiento se hace en una transacción que inserta el apunte y actualiza el saldo.
- Gastar usa `update ... where coins >= precio`: **lo decide Postgres**, así que dos compras a la
  vez no pueden dejar el saldo negativo. Hay un test de compras concurrentes que lo comprueba.
- Premios: **50 por ganar el cartón, 10 por participar**. Son excluyentes: quien gana se lleva
  50, no 60. La línea (15) sí se suma. Empatar reparte el premio; la participación no se divide.
- Anti-farmeo: jugar solo no da monedas, y hay un tope de 500 al día por usuario, que ahora
  incluye la participación. El bono diario no cuenta para ese tope.
- Los cosméticos gratis cuentan como propios desde el principio: son el punto de partida.

### Cuentas de la sala

Además del pozo de la partida en curso, cada sala lleva un **papelito de la mesa**: cuántas
partidas jugó cada uno, cuántas ganó, cuánto puso y cuánto se llevó. Se actualiza al cerrar cada
partida (`recordLobbyTally`) y viaja en `lobby:state`. Vive con la sala, en memoria: si la sala se
cierra, se cierra la cuenta. El historial que sí persiste es el del perfil.

Se muestra en tres sitios, y eso es a propósito: **dentro de la pantalla de victoria** (que es
cuando se quiere mirar, y antes quedaba tapada por el overlay), siempre en la sala, y durante la
partida si ya hay algo que contar. Sin apuestas de por medio se ocultan las columnas de plata,
que serían una pared de $0.

### Apuestas

**Son un registro entre amigos, no dinero de verdad.** La aplicación anota cuánto puso cada
quien y quién se llevó el pozo; el arreglo queda entre los jugadores. No hay pasarela de pago ni
saldo real en ninguna parte, y no tienen nada que ver con las monedas virtuales. Si algún día se
quisiera mover dinero real, eso necesita pasarela de pagos y cumplimiento de normativa de juegos
de azar: no basta con cambiar estas pantallas.

Los montos van de $500 en $500 (`BET_STEP`). Apagar el interruptor de apuestas borra lo anotado,
para que nadie quede comprometido sin saberlo.

### El cartón no delata los números cantados

A propósito: quien juega tiene que estar atento al locutor y al tablero, como en la lota de
verdad. El cartón **solo** muestra lo que uno marcó; el tablero de 90 lleva el registro general.
Hay un test que compara clase y estilo de un número cantado sin marcar contra uno que no ha
salido, para que nadie vuelva a "ayudar" resaltándolos.

### Las loteras

Las tres gatas que cantan viven en `packages/shared/src/loteros.ts` y sus imágenes en
`apps/web/public/loteros/` (webp con transparencia, así calzan con el fondo oscuro).

- Voz: se prefiere `es-CL`, luego el resto de Latinoamérica, y España **solo como último
  recurso**. Ahora bien, el navegador solo ofrece las voces instaladas en el sistema: si el equipo
  únicamente tiene `es-ES`, esa sonará. Los teléfonos suelen traer `es-MX`/`es-US`.
- El 11 siempre canta "Chúpalo entonces": es su único dicho, así que no hay sorteo. Requiere el
  interruptor `dichos` de la sala, que viene activado por defecto.
- **La Negra** es la cara de la aplicación: sale en las pantallas de entrar y registrarse, y es
  el respaldo cuando todavía no hay partida sorteada.
- Cada partida **sortea una** con `crypto.randomInt` en `prepareGame`, igual que el bolillero:
  viaja en `lobby:state`, así que todos los de la sala ven exactamente la misma. El cliente no
  elige.
- Para añadir una cuarta basta con dejar la imagen en `public/loteros/` y sumarla a `LOTEROS`;
  el sorteo la incluye sola.

### Aviso de que alguien está por ganar

Tras cada número, el servidor mira a cuánto está cada jugador de la lota en su mejor cartón y
avisa a la sala entera cuando le quedan 3, 2 o 1. Cada jugador dispara como mucho un aviso por
escalón (`closeAnnounced`), así que bajar de 3 a 2 avisa una vez y no se repite.

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
- [x] Fase 4 — Partida
- [x] Fase 5 — Locutor
- [x] Fase 6 — Economia y tienda
- [ ] Fase 7 — Produccion en Render + Neon
