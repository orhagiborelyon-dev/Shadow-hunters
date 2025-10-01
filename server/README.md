# Proyecto Node.js básico

Este es un proyecto mínimo de Node.js para comenzar rápidamente.

## Estructura

- `package.json`: Configuración del proyecto y scripts.
- `src/index.js`: Punto de entrada principal.

## Uso

Instala las dependencias (si las hubiera) y ejecuta:

```
npm start
```

Esto mostrará un mensaje en consola.

## Instrucciones para Replit / entornos similares

- Asegúrate de establecer las variables de entorno:
	- `DATABASE_URL` - URL de conexión PostgreSQL (ej: postgresql://user:pass@host/db)
	- `PORT` - puerto en el que Replit expondrá la app (Replit suele establecerlo automáticamente)

- Nota sobre el puerto de Postgres:
	- El puerto por defecto de Postgres es 5432. Si tu proveedor requiere un puerto distinto,
		puedes establecer `PGPORT` en las variables de entorno o incluir el puerto en `DATABASE_URL`.

- El servidor escucha en `0.0.0.0` por defecto y en el puerto `process.env.PORT`.

- Si Replit usa `/src` como root, ya hay un `package.json` dentro de `server/src` para soportarlo.

