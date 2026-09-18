import { useId } from 'react';

interface CampoProps {
  etiqueta: string;
  ayuda?: string;
  tipo?: 'text' | 'password';
  valor: string;
  onChange: (valor: string) => void;
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
  requerido?: boolean;
}

/** Campo de formulario con etiqueta y texto de ayuda enlazados por accesibilidad. */
export function Campo({
  etiqueta,
  ayuda,
  tipo = 'text',
  valor,
  onChange,
  autoComplete,
  maxLength,
  placeholder,
  requerido = true,
}: CampoProps) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;

  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={id} className="text-sm font-medium text-slate-200">
        {etiqueta}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        required={requerido}
        aria-describedby={ayuda ? idAyuda : undefined}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-base text-slate-100 outline-none placeholder:text-slate-600 focus:border-lota-oro focus:ring-2 focus:ring-lota-oro/30"
      />
      {ayuda ? (
        <p id={idAyuda} className="text-xs text-slate-400">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}
