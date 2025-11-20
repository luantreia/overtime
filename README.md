# Overtime API

API RESTful para la gestión de ligas y torneos de dodgeball. Sistema completo para administración de equipos, jugadores, partidos y competencias.

## Características

- 🛡️ **Seguridad robusta**: Rate limiting, validación de inputs, JWT tokens
- 📊 **Gestión completa**: Equipos, jugadores, partidos, competencias
- 🔍 **Búsqueda y paginación**: Consultas eficientes con paginación
- 📝 **Auditoría**: Registro de cambios y actividades
- 🧪 **Testing**: Cobertura de tests con Jest
- 📚 **Documentación**: Swagger UI integrado

## Instalación

```bash
# Clonar el repositorio
git clone <repository-url>
cd overtime-api

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones
```

## Configuración

Crear un archivo `.env` basado en `.env.example`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/overtime
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
API_BASE_URL=http://localhost:5000
```

## Uso

```bash
# Desarrollo
npm run dev

# Producción
npm start

# Tests
npm test
npm run test:coverage
```

## Documentación

La API cuenta con documentación automática generada con Swagger:

- **Swagger UI**: `http://localhost:5000/api-docs`
- **Especificación JSON**: `http://localhost:5000/api-docs.json`

## Estructura del Proyecto

```
overtime-api/
├── src/
│   ├── api/                 # Controladores y rutas organizadas
│   ├── models/             # Modelos de datos
│   ├── services/           # Lógica de negocio
│   ├── middleware/         # Middleware de autenticación y validación
│   ├── validators/         # Validación de inputs
│   ├── utils/             # Utilidades (JWT, logging, paginación)
│   └── constants/         # Constantes y mensajes
├── tests/                 # Pruebas unitarias e integración
├── logs/                  # Logs de la aplicación
└── swagger/              # Esquemas OpenAPI
```

## Endpoints Principales

### Autenticación
- `POST /api/auth/registro` - Registro de usuario
- `POST /api/auth/login` - Inicio de sesión
- `POST /api/auth/refresh` - Renovar token

### Equipos
- `GET /api/equipos` - Listar todos los equipos
- `POST /api/equipos` - Crear equipo (autenticado)
- `PUT /api/equipos/:id` - Actualizar equipo (admin)
- `DELETE /api/equipos/:id` - Eliminar equipo (admin)

### Jugadores
- `GET /api/jugadores` - Listar jugadores
- `POST /api/jugadores` - Crear jugador (autenticado)
- `PUT /api/jugadores/:id` - Actualizar jugador

### Partidos
- `GET /api/partidos` - Listar partidos
- `POST /api/partidos` - Crear partido (autenticado)
- `PUT /api/partidos/:id` - Actualizar partido

### Solicitudes de Edición
- `GET /api/solicitudes-edicion` Lista solicitudes (paginado). Parámetros opcionales: `tipo`, `estado`, `creadoPor`, `entidad`, `page`, `limit`, `scope`.
	- `scope=mine` solo solicitudes creadas por el usuario.
	- `scope=related` (mejorado) incluye solicitudes creadas por el usuario o en las que el usuario figura como aprobador dinámico según reglas de meta.
	- `scope=aprobables` solicitudes pendientes que el usuario puede aprobar (filtrado completo en memoria por grupos de aprobadores).
- `POST /api/solicitudes-edicion` Crea una solicitud (`tipo`, `datosPropuestos`, opcional `entidad`).
- `GET /api/solicitudes-edicion/:id` Detalle de solicitud.
- `GET /api/solicitudes-edicion/:id/aprobadores` Devuelve `{ aprobadores, puedeAprobar }`.
- `PUT /api/solicitudes-edicion/:id` Aprobar/Rechazar (estado `aceptado|rechazado`).
- `DELETE /api/solicitudes-edicion/:id` Cancelar solicitud pendiente.

Tipo nuevo incorporado: `contratoEquipoCompetencia` (aprobación equipo ↔ competencia).

Metadatos definidos en `src/config/solicitudesMeta.js`:
```js
{
  requiereDobleConfirmacion: boolean,
  camposCriticos: string[],
  rolesAprobadores: string[],
  camposPermitidosSinConsenso?: string[]
}
```

Respuesta de paginación estándar:
```json
{
  "solicitudes": [ ... ],
  "total": 42,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

#### Visibilidad por Rol (Frontends)
| Rol / App | Categorías visibles | Tipos permitidos (prefijo) | Botón Aprobar con verificación |
|-----------|---------------------|----------------------------|--------------------------------|
| Manager   | Usuarios, Contratos, Partidos | `usuario-*`, `jugador-equipo-*`, `resultadoPartido`, `resultadoSet`, `estadisticas*` | Sí (usa `GET /:id/aprobadores`) |
| DT        | Usuarios, Contratos, Participaciones Temporada, Participaciones Jugador-Temporada, Partidos | `usuario-*`, `jugador-equipo-*`, `participacion-temporada-*`, `jugador-temporada-*`, `resultadoPartido`, `resultadoSet`, `estadisticas*` | Sí (AprobarButton) |
| Organizaciones | Usuarios, Participaciones Temporada, Participaciones Jugador-Temporada | `usuario-*`, `participacion-temporada-*`, `jugador-temporada-*` | Sí (AprobarButton) |

Notas:
- El scoping `related` se refina en memoria incluyendo sólo solicitudes donde el usuario es aprobador o creador.
- Para `scope=aprobables` se calcula pertenencia y se reduce el set a solicitudes pendientes accionables.
- Al aprobar, se aplican cambios transaccionales a entidades (contratos, participaciones, vínculos jugador-temporada, etc.).

## Seguridad

La API implementa múltiples capas de seguridad:

- **Rate Limiting**: Protección contra ataques de fuerza bruta
- **Validación de Inputs**: Validación centralizada de todos los datos
- **JWT Authentication**: Autenticación segura con tokens
- **Helmet**: Encabezados de seguridad HTTP
- **CORS**: Control de acceso cross-origin

## Testing

Ejecutar la suite de tests:

```bash
# Tests unitarios
npm test

# Tests con cobertura
npm run test:coverage

# Modo observación
npm run test:watch
```

## Logging

La API utiliza Winston para logging estructurado:

- **Consola**: Logs en desarrollo
- **Archivos**: `logs/error.log` y `logs/combined.log`
- **Niveles**: error, warn, info, debug

## Contribución

1. Crear un fork del proyecto
2. Crear una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Hacer commit de los cambios (`git commit -m 'Add some AmazingFeature'`)
4. Subir los cambios (`git push origin feature/AmazingFeature`)
5. Crear un Pull Request

## Licencia

Este proyecto está bajo la licencia ISC.

## Contacto

Para soporte o consultas:
- Email: support@overtime.com
- Issues: [GitHub Issues](https://github.com/username/overtime-api/issues)

---

**Hecho con ❤️ para la comunidad dodgeball**