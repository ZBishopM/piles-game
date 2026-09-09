# Consola

Usa nushell para los comandos locales: `nu -c 'cargo test'`.
Si nu no está disponible, para y pregunta.

Dentro del VPS la consola es bash — allí no hay nu. Los bloques de la
documentación dicen cuál de las dos usa cada uno: `nu` para tu máquina, `bash`
para el servidor.

En nu, `;` encadena y se detiene si un comando falla, así que ocupa el lugar
de `&&`. Las líneas seguidas de un bloque se comportan igual.

# Despliegue

Los cambios van siempre a beta antes que a producción. El flujo completo está
en `DEPLOY.md`.

El binario sirve `client/` relativo al directorio de trabajo, así que se lanza
desde la raíz del repo, no desde `server/`.
