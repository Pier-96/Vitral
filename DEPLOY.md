# Despliegue de Vitral

La aplicación se publica como un único servicio: la interfaz y la API comparten dominio HTTPS.

1. En Render, crea un servicio desde el repositorio `Pier-96/Vitral`. Render detectará `render.yaml`.
2. Completa los valores marcados como secretos con sus equivalentes de Supabase. No copies el archivo `.env` ni subas claves a GitHub.
3. Cuando Render termine, copia la URL `https://...onrender.com`.
4. En Supabase, abre **Authentication > URL Configuration** y añade esa URL como **Site URL** y como **Redirect URL**. En Google Cloud OAuth añade la misma URL en los orígenes autorizados y `https://TU-URL/auth/v1/callback` como URI de redirección.
5. Comprueba el inicio de sesión con Google y crea un check-in de prueba.

El webhook para Apple Health quedará disponible en `https://TU-URL/api/health/webhook`. Usa el valor generado para `HEALTH_WEBHOOK_TOKEN` como cabecera `X-Health-Token`.
