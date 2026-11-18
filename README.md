# AccesoriosMoto

Tienda de accesorios para motociclistas. Los compradores pueden explorar el catálogo, iniciar sesión, guardar favoritos y realizar pedidos desde el carrito.
Los administradores pueden registrar, publicar, despublicar y eliminar productos del catálogo.

## Integrantes

- Miguel Angel Marin Montes
- Juan Jose Suarez Moncaleano
- Diana Maria Garcia Alzate

## Tecnologías

- **Frontend** · Angular 21, TypeScript 5.9, Bootstrap 5.3.9 y RxJS 7.8.
- **Backend** · Java 21, Spring Boot 4.1.1, Spring Security, JWT, Gradle y H2 en desarrollo.

## Requisitos previos

- Node.js 24 y npm. El proyecto declara npm 11.6.2.
- JDK 21 para el backend. El repositorio incluye Gradle Wrapper.
- Backend disponible en `http://localhost:8080` para probar la integración.

## Ejecutar el backend

Desde la raíz del repositorio backend, ejecuta el comando de tu sistema.

**Windows (PowerShell)**

```powershell
.\gradlew.bat bootRun
```

**Linux o macOS**

```bash
./gradlew bootRun
```

El backend queda disponible en `http://localhost:8080`. Inícialo antes del frontend para probar la integración completa.

## Ejecutar el frontend

Desde la raíz del repositorio frontend, instala las dependencias e inicia el servidor de desarrollo.

```bash
npm install
npm start
```

Abre `http://localhost:4200`. El frontend consume la API en `http://localhost:8080`.

## Usuarios de prueba

El backend crea estas cuentas de demostración al arrancar si sus correos aún no existen y `DATOS_PRUEBA_ENABLED` está activo, como ocurre por defecto.

| Rol | Correo | Contraseña |
| --- | --- | --- |
| ADMINISTRADOR | `admin@moto.com` | `admin123` |
| COMPRADOR | `comprador@moto.com` | `comprador123` |

## Pantallas principales

- **Inicio** · `/` o `/inicio`.
- **Inicio de sesión y registro** · `/login`.
- **Catálogo** · `/catalogo`.
- **Carrito y favoritos** · paneles disponibles desde la barra de navegación.
- **Administración de productos** · acciones y formulario de alta dentro del catálogo. `/catalogo/nuevo` es una entrada protegida que abre el formulario para administradores.

## Funcionalidades principales

- Autenticación JWT, control de sesión mediante guards y redirección al login cuando una petición protegida devuelve HTTP 401.
- Catálogo con datos reales, búsqueda por texto y paginación en el backend.
- Carrito, favoritos y creación de pedidos para compradores.
- Alta de productos con formulario reactivo y publicación automática. El catálogo también permite publicar, despublicar y eliminar productos como administrador.
- Avisos globales para el alta de productos y el vencimiento de sesión.
- Diseño responsive con Bootstrap, con menú desplegable y catálogo adaptado a pantallas pequeñas.

## Arquitectura frontend

Estructura de `src/app`.

- `componentes/` contiene las pantallas y los elementos reutilizables.
- `servicios/` concentra las llamadas a la API y el estado compartido.
- `modelos/` define las interfaces y tipos usados por la aplicación.
- `interceptores/` adjunta el JWT y maneja las respuestas HTTP 401 de peticiones protegidas.
- `guards/` controla el acceso a rutas según el estado de sesión.
