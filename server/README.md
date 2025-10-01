# Shadow-hunters Server

Instrucciones rápidas para instalar, ejecutar y aplicar migraciones.

Instalación

1. Desde la raíz del repo, instala dependencias del servidor:

```bash
cd server
npm install
```

Variables de entorno

- `DATABASE_URL` — URL de Postgres (ej: `postgresql://user:pass@host:5432/dbname`)
- `PORT` — puerto opcional (por defecto 3000)

Migraciones

1. Ejecuta las migraciones con:

```bash
# desde server/
DATABASE_URL="postgresql://user:pass@host:5432/dbname" npm run migrate
```

Ejecutar el servidor

```bash
# desde server/
# exporta DATABASE_URL si aplica
npm start
```

Despliegue

- Asegúrate de configurar la variable `DATABASE_URL` en tu plataforma (Render, Replit, etc.).
- El repo tiene un `package.json` raíz que delega al `server/` para que plataformas que miran la raíz detecten el servicio.

Notas

- El repositorio ignora `node_modules/`. Si ves dependencias faltantes en el entorno de despliegue, ejecuta `npm install` en `server/`.
