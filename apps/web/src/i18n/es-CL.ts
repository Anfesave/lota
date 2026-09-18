/**
 * Todos los textos visibles de la interfaz, en espanol de Chile.
 * Ningun componente debe tener texto literal: siempre pasar por aqui.
 */
export const t = {
  app: {
    nombre: 'Lota Online',
    lema: 'La lota chilena, con tus amigos, donde estés.',
  },
  comun: {
    cargando: 'Cargando...',
    volver: 'Volver',
    cancelar: 'Cancelar',
    aceptar: 'Aceptar',
    copiar: 'Copiar',
    copiado: 'Copiado',
    errorGenerico: 'Algo salió mal. Inténtalo de nuevo.',
  },
  estado: {
    servidorOk: 'Servidor conectado',
    servidorCaido: 'Sin conexión con el servidor',
    comprobando: 'Comprobando servidor...',
  },
  auth: {
    entrarTitulo: 'Entrar',
    registrarTitulo: 'Crear cuenta',
    usuario: 'Nombre de usuario',
    usuarioAyuda: 'Entre 3 y 20 caracteres: letras, números y guion bajo.',
    contrasena: 'Contraseña',
    contrasenaAyuda: 'Al menos 8 caracteres.',
    mensajeVictoria: 'Mensaje de victoria',
    mensajeVictoriaAyuda: 'Lo verán todos cuando ganes. Máximo 140 caracteres.',
    mensajeVictoriaEjemplo: 'Se cayó la lota',
    botonEntrar: 'Entrar',
    botonRegistrar: 'Crear cuenta',
    entrando: 'Entrando...',
    creando: 'Creando cuenta...',
    sinCuenta: '¿No tienes cuenta?',
    creaUna: 'Crea una',
    yaTengoCuenta: '¿Ya tienes cuenta?',
    entraAqui: 'Entra aquí',
    salir: 'Cerrar sesión',
    demasiadosIntentos: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
  },
  inicio: {
    saludo: (usuario: string) => `Hola, ${usuario}`,
    monedasEtiqueta: 'Monedas',
    tuMensaje: 'Tu mensaje de victoria',
    resumenJuego: (maxJugadores: number) =>
      `Bolillero de 1 a 90 · hasta ${maxJugadores} jugadores por sala`,
    proximamente: 'Las salas llegan en la próxima fase.',
    proximamenteDetalle: 'Por ahora puedes crear tu cuenta y dejar listo tu mensaje de victoria.',
  },
} as const;

export type Textos = typeof t;
