import { COSMETIC_TYPES, type CosmeticType, type CosmeticView, type ShopView } from '@lota/shared';
import { useEffect, useState } from 'react';
import { t } from '../i18n/es-CL.js';
import { api, postJson } from '../lib/api.js';
import { useAuthStore } from '../stores/auth.js';
import { mensajeDeError } from './Login.js';

export function Tienda() {
  const [tienda, setTienda] = useState<ShopView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const setUser = useAuthStore((estado) => estado.setUser);
  const user = useAuthStore((estado) => estado.user);

  useEffect(() => {
    void api<ShopView>('/shop')
      .then(setTienda)
      .catch((fallo: unknown) => setError(mensajeDeError(fallo)));
  }, []);

  /** Refleja en la cabecera el saldo y lo equipado tras comprar o equipar. */
  function sincronizarUsuario(nueva: ShopView) {
    setTienda(nueva);
    if (!user) return;

    const equipped: Record<string, string> = {};
    for (const cosmetico of nueva.cosmetics) {
      if (cosmetico.equipped) equipped[cosmetico.type] = cosmetico.slug;
    }
    setUser({ ...user, coins: nueva.coins, equipped });
  }

  async function accion(ruta: string, cosmetico: CosmeticView) {
    setError(null);
    setOcupado(cosmetico.id);
    try {
      sincronizarUsuario(await postJson<ShopView>(ruta, { cosmeticId: cosmetico.id }));
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-slate-100">{t.tienda.titulo}</h2>
        <p className="rounded-full bg-lota-oro/15 px-3 py-1 font-bold text-lota-oro">
          {t.tienda.saldo(tienda?.coins ?? user?.coins ?? 0)}
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {tienda === null ? (
        <p className="text-slate-400">{t.comun.cargando}</p>
      ) : (
        COSMETIC_TYPES.map((tipo) => (
          <Seccion
            key={tipo}
            tipo={tipo}
            cosmeticos={tienda.cosmetics.filter((cosmetico) => cosmetico.type === tipo)}
            ocupado={ocupado}
            onComprar={(cosmetico) => void accion('/shop/buy', cosmetico)}
            onEquipar={(cosmetico) => void accion('/cosmetics/equip', cosmetico)}
          />
        ))
      )}
    </main>
  );
}

interface SeccionProps {
  tipo: CosmeticType;
  cosmeticos: CosmeticView[];
  ocupado: string | null;
  onComprar: (cosmetico: CosmeticView) => void;
  onEquipar: (cosmetico: CosmeticView) => void;
}

function Seccion({ tipo, cosmeticos, ocupado, onComprar, onEquipar }: SeccionProps) {
  if (cosmeticos.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-bold text-slate-200">{t.tienda.tipos[tipo]}</h3>

      <ul className="grid gap-3 sm:grid-cols-2">
        {cosmeticos.map((cosmetico) => (
          <li
            key={cosmetico.id}
            className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span>
                <span className="block font-semibold text-slate-100">{cosmetico.name}</span>
                <span className="block text-xs text-slate-500">
                  {t.tienda.rarezas[cosmetico.rarity]}
                </span>
              </span>
              <Muestra cosmetico={cosmetico} />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-400">
                {cosmetico.price === 0 ? t.tienda.gratis : `${cosmetico.price} monedas`}
              </span>

              {cosmetico.equipped ? (
                <span className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-300">
                  {t.tienda.equipado}
                </span>
              ) : cosmetico.owned ? (
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => onEquipar(cosmetico)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {t.tienda.equipar}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => onComprar(cosmetico)}
                  className="rounded-lg bg-lota-acento px-3 py-1.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  {ocupado === cosmetico.id ? t.tienda.comprando : t.tienda.comprar}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Vistazo rápido de cómo se ve el cosmético. */
function Muestra({ cosmetico }: { cosmetico: CosmeticView }) {
  const { data, type } = cosmetico;

  if (type === 'CARTON_THEME') {
    return (
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded border border-black/20 text-xs font-bold"
        style={{ backgroundColor: data.fondo, color: data.numero }}
      >
        44
      </span>
    );
  }
  if (type === 'MARKER') {
    return (
      <span aria-hidden className="size-6 rounded-full" style={{ backgroundColor: data.marca }} />
    );
  }
  if (type === 'AVATAR_FRAME') {
    return (
      <span
        aria-hidden
        className="size-8 rounded-full border-2"
        style={{ borderColor: data.borde === 'transparent' ? '#475569' : data.borde }}
      />
    );
  }
  if (type === 'TITLE') {
    return <span className="text-xs italic text-slate-400">{data.texto}</span>;
  }
  return <span className="text-xs text-slate-500">{data.efecto}</span>;
}
