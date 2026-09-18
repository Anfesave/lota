import { MAX_CHAT_MESSAGE_LENGTH, type ChatMessage } from '@lota/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/es-CL.js';

interface ChatProps {
  mensajes: ChatMessage[];
  onEnviar: (texto: string) => Promise<{ ok: boolean }>;
}

export function Chat({ mensajes, onEnviar }: ChatProps) {
  const [texto, setTexto] = useState('');
  const finRef = useRef<HTMLDivElement>(null);

  // Mantener el chat pegado abajo cuando llegan mensajes nuevos. Es un extra:
  // se llama con `?.` porque no todos los entornos traen scrollIntoView y no
  // vale la pena tumbar el chat entero por no poder hacer scroll.
  useEffect(() => {
    finRef.current?.scrollIntoView?.({ block: 'end' });
  }, [mensajes.length]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const limpio = texto.trim();
    if (!limpio) return;

    // Se vacía al tiro para que se sienta instantáneo; si el servidor lo
    // rechaza (por ejemplo por el límite de 1/s) se devuelve al campo.
    setTexto('');
    const respuesta = await onEnviar(limpio);
    if (!respuesta.ok) setTexto(limpio);
  }

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/60">
      <h3 className="border-b border-slate-800 px-4 py-2.5 font-bold text-slate-100">
        {t.sala.chat}
      </h3>

      <ol className="flex max-h-64 min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-3 text-sm">
        {mensajes.length === 0 ? (
          <li className="text-slate-600">{t.sala.sinMensajes}</li>
        ) : (
          mensajes.map((mensaje) => (
            <li key={mensaje.id} className="break-words">
              <span className="font-semibold text-lota-oro">{mensaje.username}</span>
              <span className="text-slate-500">: </span>
              <span className="text-slate-200">{mensaje.text}</span>
            </li>
          ))
        )}
        <div ref={finRef} />
      </ol>

      <form onSubmit={enviar} className="flex gap-2 border-t border-slate-800 p-3">
        <input
          type="text"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          placeholder={t.sala.escribeMensaje}
          aria-label={t.sala.escribeMensaje}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-lota-oro"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          {t.sala.enviar}
        </button>
      </form>
    </section>
  );
}
