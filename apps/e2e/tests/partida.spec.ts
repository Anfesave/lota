import { expect, test, type Page } from '@playwright/test';

const CLAVE = 'unaClaveSegura1';

/** Nombres únicos por corrida: la base se limpia, pero por si acaso. */
function nombre(prefijo: string): string {
  return `${prefijo}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

async function registrarse(page: Page, usuario: string, mensaje: string): Promise<void> {
  await page.goto('/registro');
  await page.getByLabel('Nombre de usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByLabel('Mensaje de victoria').fill(mensaje);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.getByRole('heading', { name: 'Salas' })).toBeVisible();
}

/** Devuelve los 15 números del primer cartón, leyéndolos de la pantalla. */
async function numerosDelCarton(page: Page): Promise<string[]> {
  const carton = page.getByRole('group', { name: 'Cartón 1' });
  await expect(carton).toBeVisible();
  return carton.getByRole('button').allInnerTexts();
}

test.describe('una partida completa entre dos navegadores', () => {
  test('el anfitrión crea la sala, entra otro jugador y alguien canta lota', async ({
    browser,
  }) => {
    // Dos contextos = dos navegadores con cookies distintas.
    const contextoAnfitrion = await browser.newContext();
    const contextoInvitado = await browser.newContext();
    const anfitrion = await contextoAnfitrion.newPage();
    const invitado = await contextoInvitado.newPage();

    const nombreAnfitrion = nombre('pepe');
    const nombreInvitado = nombre('juanita');
    const mensajeAnfitrion = 'Se cayó la lota, compadre';

    await registrarse(anfitrion, nombreAnfitrion, mensajeAnfitrion);
    await registrarse(invitado, nombreInvitado, 'Gané yo');

    // --- El anfitrión crea la sala ---
    await anfitrion.getByLabel('Nombre de la sala').fill('Fonda dieciochera');
    await anfitrion.getByRole('button', { name: 'Crear', exact: true }).click();

    await expect(anfitrion.getByRole('heading', { name: 'Fonda dieciochera' })).toBeVisible();
    const codigo = (await anfitrion.locator('p.font-mono').innerText()).trim();
    expect(codigo).toHaveLength(6);

    // Con marcado automático la partida avanza sola hasta que haya lota.
    await anfitrion.getByLabel('Marcado automático').click();

    // --- El invitado entra por el código, como con un link de invitación ---
    await invitado.goto(`/sala/${codigo}`);
    await expect(invitado.getByRole('heading', { name: 'Fonda dieciochera' })).toBeVisible();
    await expect(anfitrion.getByText(nombreInvitado)).toBeVisible();

    // El invitado solo puede saberlo por el servidor, asi que esto confirma
    // que el cambio llego de verdad. Comprobarlo en el anfitrion no sirve: el
    // click deja la casilla marcada un instante antes de que nadie responda.
    await expect(invitado.getByLabel('Marcado automático')).toBeChecked();

    // --- Empieza la partida ---
    await anfitrion.getByRole('button', { name: 'Comenzar partida' }).click();

    // Los dos reciben sus cartones.
    await expect(anfitrion.getByRole('group', { name: 'Cartón 1' })).toBeVisible();
    await expect(invitado.getByRole('group', { name: 'Cartón 1' })).toBeVisible();

    // El locutor empieza a cantar y el tablero se va llenando.
    await expect(anfitrion.getByTestId('bola-actual')).toBeVisible();
    await expect(invitado.getByTestId('bola-actual')).toBeVisible();

    // --- Se espera a que un cartón se complete y se canta lota ---
    const numerosAnfitrion = await numerosDelCarton(anfitrion);
    const numerosInvitado = await numerosDelCarton(invitado);

    /** Espera a que todos los números de un cartón estén marcados. */
    async function cartonLleno(pagina: Page, numeros: string[]): Promise<void> {
      const carton = pagina.getByRole('group', { name: 'Cartón 1' });
      for (const numero of numeros) {
        await expect(carton.getByRole('button', { name: numero, exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
          { timeout: 60_000 },
        );
      }
    }

    // Gana quien complete primero; se espera al anfitrión salvo que el
    // invitado se adelante, así que se compite de verdad.
    const ganador = await Promise.race([
      cartonLleno(anfitrion, numerosAnfitrion).then(() => 'anfitrion' as const),
      cartonLleno(invitado, numerosInvitado).then(() => 'invitado' as const),
    ]);

    const paginaGanadora = ganador === 'anfitrion' ? anfitrion : invitado;
    await paginaGanadora.getByRole('button', { name: '¡LOTA!' }).first().click();

    // --- La pantalla de victoria la ven los dos ---
    const overlayGanador = paginaGanadora.getByRole('dialog');
    await expect(overlayGanador).toBeVisible();
    await expect(overlayGanador.getByText('¡LOTA!', { exact: true })).toBeVisible();

    const paginaPerdedora = ganador === 'anfitrion' ? invitado : anfitrion;
    await expect(paginaPerdedora.getByRole('dialog')).toBeVisible();

    // Y lleva el mensaje de victoria de quien ganó.
    const mensajeEsperado = ganador === 'anfitrion' ? mensajeAnfitrion : 'Gané yo';
    await expect(paginaPerdedora.getByRole('dialog')).toContainText(mensajeEsperado);
    await expect(paginaPerdedora.getByRole('dialog')).toContainText('Cartón ganador');

    // Volver a la sala cierra el overlay y deja la sala lista para otra.
    await paginaGanadora.getByRole('button', { name: 'Volver a la sala' }).click();
    await expect(paginaGanadora.getByRole('dialog')).toBeHidden();
    await expect(paginaGanadora.getByRole('heading', { name: 'Fonda dieciochera' })).toBeVisible();

    await contextoAnfitrion.close();
    await contextoInvitado.close();
  });

  test('una lota falsa se rechaza y bloquea el botón', async ({ page }) => {
    await registrarse(page, nombre('tramposo'), 'Gané sin ganar');

    await page.getByLabel('Nombre de la sala').fill('Sala de prueba');
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sala de prueba' })).toBeVisible();

    await page.getByRole('button', { name: 'Comenzar partida' }).click();
    await expect(page.getByRole('group', { name: 'Cartón 1' })).toBeVisible();

    // Cantar lota nada más empezar no puede colar.
    await page.getByRole('button', { name: '¡LOTA!' }).first().click();

    await expect(page.getByRole('alert')).toContainText('faltan números');
    await expect(page.getByRole('button', { name: /Espera/ }).first()).toBeDisabled();
  });
});
