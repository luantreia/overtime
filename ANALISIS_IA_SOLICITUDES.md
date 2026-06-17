# Revisión de Análisis de IA: Solicitudes de Edición en Overtime
**Actualizado:** 2 de junio de 2026

## Resumen ejecutivo

Tras revisar el código disponible en el ecosistema Overtime, el análisis de la IA sobre las solicitudes de edición resulta **parcialmente correcto**, pero mezcla aciertos con afirmaciones que no coinciden con el estado real del proyecto.

La conclusión principal es esta:

- **La infraestructura de solicitudes ya existe** en backend y en varios frontends.
- **No partimos de cero**: hay páginas, contextos, servicios y componentes reutilizables.
- **El problema principal hoy no es crear solicitudes**, sino **unificar, validar y ordenar** la implementación existente.
- **Sí hay mejoras pendientes** en permisos, scopes, experiencia de usuario y módulos adicionales que todavía no están implementados.

---

## Qué estaba mal en el análisis original

### Afirmaciones de la IA vs estado real

| Afirmación | Estado real | Veredicto |
|---|---:|---|
| Overtime-Admin tiene carpetas vacías de solicitudes | Existe `NotificacionesPage.tsx` y servicios en `shared/features/solicitudes/` | **Incorrecto** |
| Overtime-Organizaciones no tiene la ruta integrada | Existe `NotificacionesOrgPage.tsx` en `/notificaciones` con lógica por organización | **Incorrecto** |
| overtime-dt no tiene solicitudes | Tiene `NotificacionesPage.tsx`, `SolicitudesContext.tsx` y servicios completos | **Incorrecto** |
| La UI de solicitudes está en Overtime-Public | `/solicitudes` existe y está protegida por autenticación y scope | **Parcialmente correcto** |
| `scope=mine/related/aprobables` son scopes del backend | Implementados en `solicitudEdicion.js` | **Correcto** |

---

## Arquitectura real encontrada

### Backend (`overtime/src`)
- `solicitudesMeta.js`
  - Define tipos de solicitudes con metadatos.
  - Incluye reglas como roles aprobadores, campos críticos y doble confirmación.
- `solicitudEdicion.js`
  - Expone una API completa de solicitudes.
  - Soporta scopes como:
    - `mine`: solicitudes creadas por el usuario.
    - `related`: solicitudes creadas por el usuario o donde participa como aprobador dinámico.
    - `aprobables`: solicitudes que el usuario puede aprobar.

### Frontends con infraestructura de solicitudes

| Frontend | Página | Servicios | Context | Estado |
|---|---|---|---|---|
| Overtime-Admin | `/notifications` → `NotificacionesPage.tsx` | Sí | No necesario | Funcional |
| Overtime-Organizaciones | `/notificaciones` → `NotificacionesOrgPage.tsx` | Sí | Sí | Funcional |
| overtime-dt (dodgeballmanager) | `/notificaciones` → `NotificacionesPage.tsx` | Sí | Sí | Funcional |
| Overtime-Manager | `/notificaciones` → `NotificacionesPage.tsx` | Sí | Sí | Funcional |
| Overtime-Public | `/solicitudes` → `SolicitudesPage.tsx` | Sí | Sí | Funcional |
| Overtime-Partido | Sin página clara de solicitudes | Servicio local parcial | No aplica | A revisar |

### Elementos compartidos detectados
- Tipos en `shared/features/solicitudes/types/solicitudesEdicion.ts`
- Servicio API en `shared/features/solicitudes/services/solicitudesEdicionService.ts`
- Componentes reutilizables:
  - `SolicitudModal`
  - `SolicitudNotification`
  - `SolicitudEditModalSimple`
  - `SolicitudButton`
- Context providers para manejar estado global de solicitudes

---

## Estado actual: qué sí existe y qué falta

### Ya existe
- Sistema de solicitudes de edición en backend.
- Pantallas de notificaciones/solicitudes en varios frontends.
- Servicios compartidos para consumir la API.
- Contextos y componentes reutilizables.
- Lógica de scopes en el backend.

### Falta o está incompleto
1. **Unificación de la UI**
   - Hay varias implementaciones similares, pero no un panel único y consistente.
2. **Revisión fina de permisos**
   - Falta validar con precisión qué puede ver/aprobar cada rol en cada frontend.
3. **Validación más estricta en formularios**
   - No hay evidencia suficiente de una capa robusta de validación uniforme en admin.
4. **Módulos nuevos que sí parecen ausentes**
   - Generador de fixtures round-robin.
   - Brackets visuales para playoffs.
   - WebSockets para tiempo real.
   - Soporte offline en Overtime-Partido.
   - Undo/redo para correcciones de partido.

---

## Problemas reales detectados

### 1. Desalineación de la página pública de solicitudes
La ruta `/solicitudes` en Overtime-Public existe y está protegida, pero todavía requiere revisar si el flujo mostrado coincide exactamente con el diseño funcional esperado para usuarios comunes.

### 2. Validación de formularios en admin
No hay evidencia clara de una estrategia consistente de validación fuerte en todos los formularios administrativos.

### 3. Falta de un sistema visual de brackets
No se encontró un componente consolidado para brackets o llaves de eliminación directa en Overtime-Organizaciones.

### 4. Falta de generador de fixtures automático
No hay un asistente claro para generar calendarios round-robin.

### 5. Falta de soporte offline en Overtime-Partido
No se observa una implementación de IndexedDB ni sincronización offline completa.

### 6. Falta de undo/redo
No se encontró un sistema de historial de correcciones para estadísticas de partido.

### 7. Falta de WebSockets
El backend sigue apoyándose en polling según la documentación existente.

---

## Prioridades recomendadas

### Prioridad alta
1. **Auditar permisos y scopes reales**
   - Verificar qué ve y qué aprueba cada rol.
2. **Unificar la experiencia de notificaciones**
   - Reducir duplicación entre frontends.
3. **Confirmar el flujo de `/solicitudes` en Overtime-Public**
   - Revisar que la pantalla corresponda al comportamiento esperado.

### Prioridad media
4. **Mejorar validación de formularios**
   - Especialmente en administración.
5. **Ordenar componentes y servicios compartidos**
   - Evitar divergencias entre apps.

### Prioridad nueva
6. **Implementar módulos faltantes**
   - Fixtures round-robin.
   - Brackets visuales.
   - Realtime.
   - Offline.
   - Undo/redo.

---

## Plan de continuidad

### Fase 1: Auditoría funcional
**Objetivo:** confirmar qué está realmente activo y qué depende de cada rol.

- Revisar `SolicitudesPage.tsx` y `NotificacionesPage.tsx` en cada frontend.
- Verificar permisos reales sobre scopes `mine`, `related` y `aprobables`.
- Identificar diferencias entre UI, backend y comportamiento esperado.
- Documentar qué frontend usa cada flujo.

### Fase 2: Unificación de notificaciones
**Objetivo:** reducir duplicación y tener una base común.

- Extraer un panel o contenedor compartido para solicitudes.
- Normalizar props, filtros y callbacks.
- Definir qué partes son compartidas y cuáles quedan específicas por app.
- Alinear estilo visual y experiencia de uso.

### Fase 3: Validación y reglas de negocio
**Objetivo:** reforzar integridad de formularios y acciones.

- Revisar formularios administrativos críticos.
- Definir validaciones consistentes.
- Confirmar qué reglas deben vivir en frontend y cuáles en backend.
- Detectar puntos donde hoy pueda crearse inconsistencia de datos.

### Fase 4: Cerrar módulos faltantes de producto
**Objetivo:** avanzar en funcionalidades nuevas que no existen todavía.

- Diseñar generador de fixtures round-robin.
- Definir componente visual de brackets.
- Priorizar realtime frente a offline según impacto.
- Estimar alcance para undo/redo de estadísticas de partido.

### Fase 5: Consolidación técnica
**Objetivo:** evitar que el crecimiento siga fragmentando el sistema.

- Revisar estructura compartida `shared/features/solicitudes`.
- Ordenar imports, tipos y servicios.
- Alinear naming entre frontends.
- Documentar contratos de integración.

---

## Secuencia recomendada para continuar

1. **Auditar permisos y scopes**
2. **Unificar el panel de solicitudes**
3. **Revisar validaciones de formularios**
4. **Cerrar huecos de producto nuevos**
5. **Consolidar documentación técnica**

---

## Conclusión

El análisis de la IA original **no describe correctamente el estado real** del sistema.

La realidad actual es que:

- la infraestructura de solicitudes **ya está bastante madura**;
- el trabajo pendiente está más cerca de **consolidación y mejora** que de creación;
- los mayores huecos están en **unificación, permisos, experiencia de usuario y módulos nuevos**.

En otras palabras:  
**no hace falta reconstruir el sistema de solicitudes; hace falta terminar de ordenarlo y cerrar los faltantes reales.**
