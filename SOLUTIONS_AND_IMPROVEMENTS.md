# Análisis y Mejoras: Overtime API

## 📊 Estado Actual
- **Madurez**: Alta. El núcleo es estable y soporta múltiples frontends.
- **Cobertura**: Cubre todos los flujos principales de negocio.
- **Deuda Técnica**: Moderada. Faltan tests unitarios exhaustivos y la documentación de Swagger podría estar desactualizada en algunos endpoints nuevos.

## 🛑 Funcionalidades Faltantes / Por Completar
1.  **WebSockets Nativos**: Actualmente los clientes usan *polling* para actualizaciones. Se necesita Socket.io para:
    -   Actualización de marcador en tiempo real (Public Page).
    -   Notificaciones push (Solicitudes).
2.  **Rate Limiting Granular**: Proteger endpoints pesados (ej. reportes, búsquedas complejas).
3.  **Soft Delete**: Implementar borrado lógico en todas las entidades principales para evitar pérdida de datos accidental.

## 💡 Plan de Mejoras
1.  **Fase 1: Robustez (Corto Plazo)**
    -   Aumentar cobertura de tests (Jest) al 80% en `services/`.
    -   Implementar validación estricta de tipos en todos los inputs (Zod o Joi, migrando de express-validator paulatinamente si es necesario).
2.  **Fase 2: Real-time (Mediano Plazo)**
    -   Integrar Socket.io en `server.js`.
    -   Emitir eventos en `partidoService` (ej. `match:update`) y `solicitudService` (ej. `request:created`).
3.  **Fase 3: Optimización (Largo Plazo)**
    -   Caching con Redis para endpoints de lectura frecuente (Leaderboards, Listados públicos).
    -   Microservicios: Separar el motor de estadísticas o el módulo de Ranked si la carga aumenta.

## 🔗 Integración
- **Ranked Mode**: Asegurar que el cálculo de ELO sea idempotente (ya implementado con flags) y transaccional.
- **Public Page**: Exponer endpoints "light" (con `select` de campos) para reducir el payload en la home page.
