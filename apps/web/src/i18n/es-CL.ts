/**
 * Todos los textos visibles de la interfaz, en espanol de Chile.
 * Ningun componente debe tener texto literal: siempre pasar por aqui.
 */
export const t = {
  app: {
    nombre: 'Lota Online',
    lema: 'La lota chilena, con tus amigos, donde estes.',
  },
  comun: {
    cargando: 'Cargando...',
    volver: 'Volver',
    cancelar: 'Cancelar',
    aceptar: 'Aceptar',
    copiar: 'Copiar',
    copiado: 'Copiado',
    errorGenerico: 'Algo salio mal. Intentalo de nuevo.',
  },
  estado: {
    servidorOk: 'Servidor conectado',
    servidorCaido: 'Sin conexion con el servidor',
    comprobando: 'Comprobando servidor...',
  },
} as const;

export type Textos = typeof t;
