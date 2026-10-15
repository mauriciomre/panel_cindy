# Panel Cindy

Menú principal de herramientas del equipo (estilo menú de Odoo). PHP + SQLite, sin dependencias.

- Producción: https://panel.bagsstore.com.ar (Ferozo, `public_html/panel`)
- Prueba local: `docker compose up -d --build` y abrir http://localhost:8082 (usa PHP 8.0, igual que el hosting)
- Deploy: cada `git push` a `main` dispara el webhook de Ferozo. Si no se actualiza, Ferozo → Mi Sitio Web → GIT → "Desplegar".
- La base `data/panel.sqlite` no se versiona; `data/.htaccess` bloquea el acceso web.
- La primera visita a un sitio nuevo pide crear el administrador.
