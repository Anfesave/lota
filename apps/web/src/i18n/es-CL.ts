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
  auth: {
    entrarTitulo: 'Entrar',
    registrarTitulo: 'Crear cuenta',
    usuario: 'Nombre de usuario',
    usuarioAyuda: 'Entre 3 y 20 caracteres: letras, numeros y guion bajo.',
    contrasena: 'Contrasena',
    contrasenaAyuda: 'Al menos 8 caracteres.',
    mensajeVictoria: 'Mensaje de victoria',
    mensajeVictoriaAyuda: 'Lo veran todos cuando ganes. Maximo 140 caracteres.',
    mensajeVictoriaEjemplo: 'Se cayo la lota',
    botonEntrar: 'Entrar',
    botonRegistrar: 'Crear cuenta',
    entrando: 'Entrando...',
    creando: 'Creando cuenta...',
    sinCuenta: 'No tienes cuenta?',
    creaUna: 'Crea una',
    yaTengoCuenta: 'Ya tienes cuenta?',
    entraAqui: 'Entra aqui',
    salir: 'Cerrar sesion',
    demasiadosIntentos: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
  },
  inicio: {
    saludo: (usuario: string) => `Hola, ${usuario}`,
    monedasEtiqueta: 'Monedas',
    tuMensaje: 'Tu mensaje de victoria',
    proximamente: 'Las salas llegan en la proxima fase.',
    proximamenteDetalle: 'Por ahora puedes crear tu cuenta y dejar listo tu mensaje de victoria.',
  },
} as const;

export type Textos = typeof t;
