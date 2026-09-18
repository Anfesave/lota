import { loteroById, type LoteroId } from '@lota/shared';
import { t } from '../../i18n/es-CL.js';

interface LoteraProps {
  id: LoteroId | undefined;
  /** `grande` para la portada, `chica` para el costado de la bola. */
  tamano?: 'grande' | 'chica';
  /** Si canta ahora mismo, se le da un rebote. */
  cantando?: boolean;
}

/** La gata que canta los números. */
export function Lotera({ id, tamano = 'chica', cantando = false }: LoteraProps) {
  const lotera = loteroById(id);
  const grande = tamano === 'grande';

  return (
    <figure className="flex flex-col items-center gap-1">
      <img
        // La `key` reinicia la animación cada vez que canta un número nuevo.
        key={cantando ? `${lotera.id}-cantando` : lotera.id}
        src={lotera.imagen}
        alt={t.locutor.retratoDe(lotera.nombre)}
        width={grande ? 320 : 128}
        height={grande ? 320 : 128}
        // Es decoración pesada: que no bloquee lo demás al cargar.
        loading={grande ? 'eager' : 'lazy'}
        decoding="async"
        className={[
          grande ? 'w-56 sm:w-64' : 'w-24 sm:w-28',
          'drop-shadow-xl',
          cantando ? 'animate-[canta_500ms_ease-out]' : '',
        ].join(' ')}
      />
      <figcaption
        className={
          grande ? 'text-sm font-semibold text-slate-300' : 'text-xs font-semibold text-slate-400'
        }
      >
        {lotera.nombre}
      </figcaption>
    </figure>
  );
}
