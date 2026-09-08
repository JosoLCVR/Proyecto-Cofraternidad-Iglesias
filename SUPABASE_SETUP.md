# Base de datos de Cofraternidad

La definición completa está en [database.sql](database.sql). Está preparada para Supabase y crea:

- Iglesias, perfiles de usuario y configuración general.
- Pagos con estados, referencias únicas y relación con la iglesia.
- Solicitudes legales con estados y prioridades.
- Bucket privado `payment-receipts` para comprobantes.
- RLS: el administrador ve todo; cada iglesia solo ve y crea sus propios registros.

## Configuración

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor**, pega `database.sql` y pulsa **Run**.
3. En **Authentication > Users**, crea un usuario administrador y un usuario de iglesia.
4. En **Table Editor > profiles**, asigna:
   - Administrador: `role = admin`, `church_id = NULL`.
   - Representante: `role = church`, `church_id = 1` para Iglesia El Buen Pastor.
5. Obtén la URL del proyecto y la clave pública `anon` en **Project Settings > API**.

## Importante

El login actual de la demo usa `sessionStorage` y las credenciales `*.test`; todavía no llama a Supabase Auth. Para producción hay que reemplazar `CofraternidadStore.login()` por `supabase.auth.signInWithPassword()` y cargar los datos con consultas Supabase. No pongas nunca la clave `service_role` en HTML.