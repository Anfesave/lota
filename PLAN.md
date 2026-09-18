# PLAN.md — Lota Online Multijugador

> Documento de instrucciones para Claude Code. Léelo completo antes de escribir código.
> Trabaja **una fase a la vez**, en orden. Al terminar cada fase: ejecuta los tests, haz commit
> y detente para que el usuario revise antes de continuar con la siguiente.

---

## 1. Visión del producto

Sitio web para jugar a la **lota chilena** en línea con amigos o desconocidos.

- Los usuarios se registran con **nombre de usuario único**, **contraseña** y un **mensaje de victoria**.
- Cualquier usuario puede **crear un lobby** (sala), que puede ser:
  - **Público**: aparece en el listado de salas y cualquiera puede entrar.
  - **Privado**: no aparece en el listado; se entra con **link de invitación + contraseña**.
- En la **sala previa** el anfitrión configura: cartones por jugador (1–4), velocidad del locutor y modo de premio.
- Máximo **10 jugadores** por sala.
- Un **locutor** canta los números en voz alta a la velocidad configurada.
- El ganador ve una **pantalla de victoria** que también ven todos los demás, con su mensaje de victoria.
- El ganador recibe **monedas virtuales** canjeables por **cosméticos** en una tienda.

---

## 2. Stack tecnológico (decisión tomada)

**TypeScript de punta a punta**, en un monorepo con pnpm workspaces.

| Capa                | Tecnología                                                     | Motivo                                            |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Frontend            | React 18 + Vite + TypeScript                                   | SPA rápida, ecosistema enorme                     |
| Estilos             | Tailwind CSS                                                   | Rápido de iterar, fácil de tematizar (cosméticos) |
| Estado cliente      | Zustand                                                        | Simple, suficiente para el estado de juego        |
| Backend HTTP        | Fastify + TypeScript                                           | Rápido, tipado, plugins maduros                   |
| Tiempo real         | Socket.IO                                                      | Rooms, reconexión automática, ack de eventos      |
| Validación          | Zod (compartido cliente/servidor)                              | Un solo esquema para ambos lados                  |
| Base de datos       | PostgreSQL 16                                                  | Datos relacionales y transacciones de monedas     |
| ORM                 | Drizzle ORM + drizzle-kit (migraciones)                        | Tipado fuerte, SQL explícito                      |
| Hash de contraseñas | argon2 (argon2id)                                              | Estándar actual recomendado                       |
| Sesiones            | Cookie httpOnly + tabla `sessions` en Postgres                 | Sin JWT en localStorage, revocables               |
| Tests               | Vitest (unitarios) + Playwright (e2e)                          |                                                   |
| Despliegue          | Un contenedor Docker en Fly.io o Railway + Postgres gestionado | WebSockets requieren servidor persistente         |

**Arquitectura de despliegue inicial:** un único proceso Node que sirve la SPA estática, la API REST
y Socket.IO. El estado de las salas vive **en memoria** del servidor (una sala tiene como máximo
10 jugadores, una sola instancia soporta miles de salas). Diseñar la capa de salas detrás de una
interfaz (`LobbyStore`) para poder migrar a Redis + `@socket.io/redis-adapter` si en el futuro se
necesitan varias instancias.

### Estructura del monorepo

```
lota/
├─ apps/
│  ├─ web/          # React + Vite
│  └─ server/       # Fastify + Socket.IO
├─ packages/
│  └─ shared/       # tipos, esquemas Zod, eventos de socket, lógica pura del juego
├─ docker-compose.yml   # Postgres local
├─ Dockerfile
├─ CLAUDE.md
└─ PLAN.md
```

La **lógica pura del juego** (generar cartones, validar lota, sortear números) va en
`packages/shared/game` sin dependencias de red ni BD, para poder testearla al 100%.

---

## 3. Reglas del juego (lota chilena)

- Bolillero de **1 a 90**.
- **Cartón**: grilla de **3 filas × 9 columnas** con **15 números** (5 por fila, 4 espacios vacíos por fila).
  - Columna 1: 1–9, columna 2: 10–19, … columna 9: 80–90.
  - Cada columna tiene entre 1 y 3 números, ordenados de menor a mayor de arriba hacia abajo.
  - Los cartones de un mismo jugador no deben repetirse; idealmente tampoco entre jugadores de la sala.
- **Modos de premio** (configurable por el anfitrión):
  - `CARTON_LLENO`: gana quien complete los 15 números de un cartón. Termina la partida.
  - `LINEA_Y_CARTON`: primero se juega por **línea** (una fila completa, premio menor, la partida sigue) y luego por **cartón lleno** (premio mayor, termina la partida).
- **Marcado**: el jugador marca manualmente los números en su cartón (como en la lota real).
  Opción de configuración de sala: `autoMarcado` (el sistema marca solo).
- **Cantar lota**: el jugador presiona el botón "¡LOTA!" (o "¡LÍNEA!"). El **servidor valida**
  contra los números efectivamente cantados. Si es válida, gana. Si es inválida, el jugador
  recibe una advertencia y un bloqueo de 10 segundos para volver a cantar.
- **Empate**: si dos o más jugadores cantan válidamente con el mismo último número, todos ganan
  y el premio en monedas se divide (redondeando hacia arriba).
- El servidor usa `crypto.randomInt` para sortear. **El cliente nunca decide nada**; solo muestra.

---

## 4. Modelo de datos (PostgreSQL)

```
users
  id              uuid pk
  username        citext unique not null   -- 3–20 chars, [a-zA-Z0-9_]
  password_hash   text not null
  victory_message varchar(140) not null
  coins           integer not null default 0 check (coins >= 0)
  created_at      timestamptz default now()

sessions
  id          text pk            -- token aleatorio de 32 bytes, se guarda hasheado
  user_id     uuid fk -> users
  expires_at  timestamptz
  created_at  timestamptz

cosmetics
  id          uuid pk
  slug        text unique
  name        text
  type        enum('CARTON_THEME','MARKER','AVATAR_FRAME','VICTORY_EFFECT','TITLE')
  price       integer
  rarity      enum('COMUN','RARO','EPICO','LEGENDARIO')
  data        jsonb            -- colores, clases CSS, id de animación, etc.
  active      boolean default true

user_cosmetics
  user_id      uuid fk
  cosmetic_id  uuid fk
  acquired_at  timestamptz
  pk (user_id, cosmetic_id)

user_equipped
  user_id      uuid fk
  type         (mismo enum que cosmetics.type)
  cosmetic_id  uuid fk
  pk (user_id, type)

coin_transactions            -- libro contable; users.coins es un saldo derivado
  id          uuid pk
  user_id     uuid fk
  amount      integer          -- positivo = ganado, negativo = gastado
  reason      enum('GAME_WIN','LINE_WIN','PURCHASE','DAILY_BONUS','ADMIN')
  ref_id      uuid null        -- game_id o cosmetic_id
  created_at  timestamptz

games                        -- historial de partidas terminadas
  id            uuid pk
  host_id       uuid fk
  settings      jsonb
  drawn_numbers integer[]
  started_at    timestamptz
  ended_at      timestamptz

game_players
  game_id    uuid fk
  user_id    uuid fk
  cards      jsonb
  result     enum('WIN_FULL','WIN_LINE','NONE')
  coins_won  integer
  pk (game_id, user_id)
```

Toda modificación de `coins` se hace **en una transacción** que inserta en `coin_transactions`
y actualiza `users.coins` a la vez. La compra usa `UPDATE ... WHERE coins >= price` para evitar
saldos negativos por condiciones de carrera.

Las salas activas **no** se guardan en BD: viven en memoria. Solo al terminar una partida se
persiste en `games` y `game_players`.

---

## 5. Estado de una sala (en memoria)

```ts
type LobbyStatus = 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED';

interface Lobby {
  id: string; // uuid
  code: string; // 6 chars legibles para el link, ej: "K7P2QX"
  name: string;
  hostId: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  passwordHash?: string; // solo si PRIVATE
  status: LobbyStatus;
  settings: {
    cardsPerPlayer: 1 | 2 | 3 | 4;
    callIntervalMs: 3000 | 5000 | 8000 | 12000; // Rápida / Normal / Lenta / Muy lenta
    prizeMode: 'CARTON_LLENO' | 'LINEA_Y_CARTON';
    autoMark: boolean;
  };
  players: Map<
    userId,
    {
      userId: string;
      username: string;
      ready: boolean;
      connected: boolean;
      cards: Card[];
      marks: Set<number>;
      claimBlockedUntil?: number;
      equipped: EquippedCosmetics;
    }
  >;
  drawn: number[]; // números cantados en orden
  bag: number[]; // números restantes, ya barajados
  lineWinnerIds?: string[];
  winnerIds?: string[];
}
```

- `MAX_PLAYERS = 10`.
- Si el anfitrión se desconecta más de 30 s en `WAITING`, el rol pasa al jugador más antiguo.
- Durante `PLAYING`, un jugador desconectado conserva su lugar y sus cartones; al reconectar
  recibe el estado completo (`lobby:state`). Si la partida termina sin él, simplemente no gana.
- Una sala vacía se elimina tras 2 minutos.
- La configuración solo se puede cambiar en `WAITING` y solo por el anfitrión.

---

## 6. API REST

```
POST /api/auth/register   { username, password, victoryMessage }
POST /api/auth/login      { username, password }
POST /api/auth/logout
GET  /api/me              → usuario, monedas, cosméticos equipados
PATCH /api/me             { victoryMessage }

GET  /api/lobbies         → salas públicas en WAITING (nombre, anfitrión, jugadores/10)
POST /api/lobbies         { name, visibility, password? } → { code }
GET  /api/lobbies/:code   → info pública (nombre, si requiere contraseña, cupos)

GET  /api/shop            → cosméticos activos + cuáles tiene el usuario
POST /api/shop/buy        { cosmeticId }
POST /api/cosmetics/equip { cosmeticId }

GET  /api/me/history      → últimas 20 partidas
```

Reglas: contraseñas de 8–72 caracteres; rate limit en login/registro (`@fastify/rate-limit`,
5 intentos/minuto por IP+usuario); mensajes de error genéricos en login ("usuario o contraseña
incorrectos").

---

## 7. Eventos Socket.IO

Todos los payloads se definen y validan con Zod en `packages/shared/events.ts`. El socket se
autentica con la cookie de sesión en el handshake; sin sesión válida se rechaza la conexión.

**Cliente → servidor**

| Evento                 | Payload                                 | Notas                                                                  |
| ---------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `lobby:join`           | `{ code, password? }`                   | Valida cupo, contraseña y estado                                       |
| `lobby:leave`          | —                                       |                                                                        |
| `lobby:ready`          | `{ ready }`                             |                                                                        |
| `lobby:updateSettings` | `Partial<settings>`                     | Solo anfitrión, solo en WAITING                                        |
| `lobby:kick`           | `{ userId }`                            | Solo anfitrión                                                         |
| `game:start`           | —                                       | Solo anfitrión; mínimo 1 jugador (permite practicar solo, sin monedas) |
| `game:mark`            | `{ cardIndex, number }`                 | Solo se acepta si el número ya salió                                   |
| `game:claim`           | `{ type: 'LINE' \| 'FULL', cardIndex }` | Validación en servidor                                                 |
| `chat:send`            | `{ text }`                              | Máx. 200 chars, rate limit 1/s                                         |

**Servidor → cliente**

| Evento                                    | Payload                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `lobby:state`                             | Estado completo sanitizado (sin cartones ajenos, sin `bag`)              |
| `lobby:playerJoined` / `lobby:playerLeft` |                                                                          |
| `lobby:settingsChanged`                   |                                                                          |
| `game:countdown`                          | `{ seconds: 5 }`                                                         |
| `game:started`                            | `{ yourCards }`                                                          |
| `game:numberCalled`                       | `{ number, index, calledAt }`                                            |
| `game:claimRejected`                      | `{ reason, blockedUntil }` (solo al que cantó)                           |
| `game:lineWon`                            | `{ winners: [{ username, victoryMessage }] }`                            |
| `game:finished`                           | `{ winners: [{ username, victoryMessage, coinsWon, equipped }], drawn }` |
| `chat:message`                            |                                                                          |
| `error`                                   | `{ code, message }`                                                      |

El bucle del locutor corre **en el servidor** con `setTimeout` encadenado (no `setInterval`),
sacando un número de `bag` cada `callIntervalMs`. Se detiene al haber ganador de cartón lleno o
al agotarse la bolsa.

---

## 8. El locutor

- **Voz**:
  - MVP: Web Speech API (`speechSynthesis`) eligiendo una voz `es-CL`, `es-419` o `es-*`, en ese orden.
  - Producción: 90 clips de audio pregrabados o generados una vez con un servicio TTS
    (`/public/audio/numeros/01.mp3` … `90.mp3`) más frases ("¡Comenzamos!", "¡Tenemos lota!").
    Precargar todos los clips al entrar a la sala. Dejar la interfaz `Announcer` preparada para
    ambos backends.
- **Dichos de la lota** (opcional, interruptor en la sala): frases tradicionales asociadas a
  ciertos números, en un archivo `packages/shared/dichos.ts` que el usuario completará. Crear el
  archivo con la estructura `Record<number, string[]>` y unos pocos ejemplos de relleno.
- Visual: bola grande animada con el número actual, las últimas 5 bolas y un **tablero de 90
  números** con los ya cantados resaltados.
- Controles locales por jugador: silenciar voz y volumen (no afectan a los demás).
- El texto del número se muestra siempre, aunque el audio esté silenciado.

---

## 9. Monedas y cosméticos

**Recompensas** (constantes en `packages/shared/economy.ts` para poder ajustarlas):

- Cartón lleno: `50 + 10 × (jugadores − 1)` monedas.
- Línea: 15 monedas.
- Bono diario al primer inicio de sesión del día: 10 monedas.
- **Anti-farmeo**: no se otorgan monedas si la partida tuvo menos de 2 jugadores humanos, y hay un
  tope de 500 monedas ganadas en partidas por usuario por día.

**Cosméticos iniciales** (seed): 3–4 por tipo.

- `CARTON_THEME`: colores/fondo del cartón (ej. "Clásico", "Pizarra", "Fonda dieciochera", "Neón").
- `MARKER`: estilo de la ficha que marca (poroto, tapa de bebida, círculo, estrella).
- `AVATAR_FRAME`: marco alrededor del nombre en la lista de jugadores.
- `VICTORY_EFFECT`: animación en la pantalla de victoria (confeti, fuegos artificiales, lluvia de monedas).
- `TITLE`: título bajo el nombre ("Suertudo", "Leyenda de la lota").

Los cosméticos equipados de cada jugador son **visibles para todos** en la sala y en la pantalla de victoria.

---

## 10. Pantallas

1. **Inicio / Login / Registro**
2. **Lobby principal**: listado de salas públicas (refresco en vivo), botón "Crear sala", campo "Unirse con código".
3. **Sala previa**: jugadores con estado "listo", configuración (editable solo por anfitrión),
   botón "Copiar link de invitación", chat, botón "Comenzar" (anfitrión).
4. **Partida**: bola actual, tablero de 90, cartones del jugador (grilla responsiva: 1–2 columnas
   en móvil), botones "¡LÍNEA!" y "¡LOTA!", lista de jugadores, chat.
5. **Pantalla de victoria** (overlay para todos): nombre del ganador, su mensaje de victoria, su
   efecto de victoria equipado, monedas ganadas, cartón ganador. Botones "Volver a la sala" y "Salir".
6. **Tienda**: grilla de cosméticos con precio, saldo actual, comprar/equipar.
7. **Perfil**: editar mensaje de victoria, historial de partidas, cosméticos equipados.

**Link de invitación**: `https://<dominio>/sala/<code>`. Si el usuario no ha iniciado sesión, se le
lleva a login y luego se le devuelve al link. Si la sala es privada, se pide la contraseña.

La interfaz debe funcionar bien en **móvil** (la mayoría jugará desde el teléfono).

---

## 11. Seguridad y robustez (checklist)

- [ ] El servidor es la única autoridad: sorteo, cartones, validación de lota, monedas.
- [ ] Nunca enviar al cliente la `bag`, ni los cartones de otros jugadores durante la partida.
- [ ] Todos los payloads de socket validados con Zod; rechazar y registrar los inválidos.
- [ ] Rate limit en eventos de socket (claim, chat, mark).
- [ ] Cookies `httpOnly`, `secure`, `sameSite=lax`; CORS restringido al dominio propio.
- [ ] Contraseñas de sala hasheadas con argon2; códigos de sala sin caracteres ambiguos (0/O, 1/I).
- [ ] Sanitizar mensajes de victoria y chat (React escapa por defecto; no usar `dangerouslySetInnerHTML`).
- [ ] Filtro básico de palabras ofensivas en nombres de usuario y mensajes de victoria (lista editable).
- [ ] Logs estructurados con pino (incluido en Fastify).
- [ ] Endpoint `/health` para el proveedor de hosting.
- [ ] Apagado ordenado: al recibir SIGTERM, avisar a las salas activas y dejar de aceptar conexiones.

---

## 12. Fases de desarrollo

### Fase 0 — Andamiaje

- Monorepo pnpm, TypeScript estricto, ESLint + Prettier, Vitest.
- `docker-compose.yml` con Postgres. Drizzle configurado con primera migración vacía.
- `apps/server` con Fastify respondiendo `/health`; `apps/web` con Vite mostrando una página.
- Script `pnpm dev` que levanta ambos. `CLAUDE.md` con comandos y convenciones.
- **Listo cuando**: `pnpm dev`, `pnpm test` y `pnpm build` funcionan sin errores.

### Fase 1 — Autenticación

- Tablas `users` y `sessions`. Registro, login, logout, `/api/me`.
- Páginas de login/registro y rutas protegidas en el frontend.
- **Listo cuando**: tests cubren usuario duplicado (sin distinguir mayúsculas), contraseña
  incorrecta, sesión expirada y rate limit.

### Fase 2 — Lógica pura del juego (`packages/shared/game`)

- `generateCard()`, `generateUniqueCards(n)`, `checkLine()`, `checkFull()`, `createBag()`.
- **Listo cuando**: tests de propiedades (generar 10.000 cartones) verifican 15 números,
  5 por fila, rangos de columna correctos, orden vertical y ausencia de duplicados.

### Fase 3 — Salas

- `LobbyStore` en memoria, API REST de salas, Socket.IO autenticado.
- Crear/unirse/salir, público/privado con contraseña, link de invitación, listo/no listo,
  configuración, expulsar, migración de anfitrión, límite de 10, chat.
- Pantallas de lobby principal y sala previa.
- **Listo cuando**: test de integración con varios clientes socket simulados cubre sala llena,
  contraseña errónea y anfitrión desconectado.

### Fase 4 — Partida

- Cuenta regresiva, reparto de cartones, bucle del locutor en servidor, marcado, claim de
  línea y lota, empates, fin de partida, reconexión con estado completo.
- Pantalla de partida y overlay de victoria (sin monedas todavía).
- **Listo cuando**: test e2e con Playwright de 2 navegadores jugando una partida completa con
  `callIntervalMs` reducido en modo test.

### Fase 5 — Locutor

- Interfaz `Announcer` con implementación Web Speech API, controles de volumen/silencio,
  animación de bola, tablero de 90, archivo de dichos.
- **Listo cuando**: el canto se escucha sincronizado con la bola en Chrome y Safari móvil
  (recordar que iOS exige un gesto del usuario para habilitar audio: botón "Activar sonido").

### Fase 6 — Economía y tienda

- Tablas de cosméticos, transacciones y equipamiento. Seed de cosméticos.
- Otorgar monedas al terminar la partida (transaccional), reglas anti-farmeo, bono diario.
- Tienda, equipar, y aplicar cosméticos en sala, partida y pantalla de victoria.
- Persistir `games` y `game_players`; historial en perfil.
- **Listo cuando**: test de compras concurrentes demuestra que el saldo nunca queda negativo.

### Fase 7 — Producción

- Dockerfile multi-etapa (build de web + server, imagen final solo con runtime).
- Configuración para Fly.io (`fly.toml`) con Postgres gestionado; variables de entorno documentadas en `.env.example`.
- Migraciones automáticas al desplegar. Checklist de seguridad (sección 11) completo.
- **Listo cuando**: el sitio funciona en una URL pública con HTTPS y WebSockets.

---

## 13. Convenciones para Claude Code

- TypeScript `strict: true`; prohibido `any` salvo justificación en comentario.
- Nombres de código en inglés; **textos de la interfaz en español de Chile**, centralizados en
  `apps/web/src/i18n/es-CL.ts`.
- Constantes de juego y economía en `packages/shared`, nunca números mágicos repartidos.
- Cada fase termina con tests pasando y un commit con mensaje descriptivo.
- Ante una decisión de producto no cubierta por este plan, **pregunta antes de implementar**.
