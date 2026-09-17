# Configuración local

1. Crea la base PostgreSQL `cofraternidad_db` y ejecuta `database.sql`.
2. Instala Node.js LTS.
3. Copia `.env.example` a `.env` y completa `DB_PASSWORD` con la contraseña de PostgreSQL.
4. Instala las dependencias con `npm install express pg dotenv cors`.
5. Enciende el servidor con `node server.js` o `npm start`.
6. Abre `http://localhost:5000/login.html`.

## API de clientes

Registrar una iglesia/cliente:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/clientes -ContentType 'application/json' -Body (@{
	nombre_organizacion = 'Iglesia Ejemplo'
	representante_legal = 'Juan Pérez'
	documento_identidad = 'V-12345678'
	telefono = '+58 412 1234567'
	email = 'contacto@ejemplo.org'
	estatus_juridico = 'En proceso'
} | ConvertTo-Json)
```

Consultar los clientes registrados:

```powershell
Invoke-RestMethod -Uri http://localhost:5000/api/clientes
```

El formulario de afiliación de `index.html` ejecuta automáticamente el primer request y luego actualiza el directorio interno de iglesias.

El frontend ya no usa LocalStorage ni Supabase. `server.js` mantiene las sesiones y aplica permisos: el administrador ve todo y cada usuario de iglesia solo ve sus registros.

## Primer administrador

El registro publico crea usuarios de iglesia y requiere `churchId`. Para crear el primer administrador, ejecuta este SQL reemplazando el hash por uno generado con `bcryptjs` desde Node:

```sql
insert into app_users (name, email, password_hash, role)
values ('Administrador', 'admin@tu-dominio.local', '<hash-bcrypt>', 'admin');
```

Para generar el hash:

```powershell
node -e "console.log(require('bcryptjs').hashSync('CambiaEstaClave123!', 12))"
```

Después de crear una iglesia desde el panel, puedes registrar su usuario con `POST /api/auth/register` enviando `name`, `email`, `password` y `churchId`.
