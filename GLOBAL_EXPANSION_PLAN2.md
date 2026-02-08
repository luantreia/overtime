# 🌎 Overtime: Plan de Expansión Global - Fase 2
## Estado Actual vs. Visión de Futuro

Este documento actualiza el plan original tras la implementación de los cimientos del ranking multinivel y la validación de organizaciones.

---

### 1. Sistema de Rankings (Completado ✅)
Ya contamos con la **Triple Vara** operativa en el backend:
-   **Nivel 1 (Global Maestro):** Operativo con sistema de multiplicadores. 
-   **Nivel 2 (Competencia):** Operativo (histórico de liga).
-   **Nivel 3 (Temporada):** Operativo (ranking de torneo corto).

**Regla de Negocio Actual:**
- `Organización Verificada` = 1.0x al Rank Global.
- `Organización No Verificada` = 0x al Rank Global (No suma para evitar "boosteo").
- `Partidos de Plaza (Sin Org)` = 0.3x al Rank Global (Incentivo semillero).

---

### 2. Identidad y Confianza (En Proceso 🛠️)
-   **Modelo de Jugador (Completado ✅):** Ya existen campos `userId`, `perfilReclamado` y lógica de seguridad.
-   **Vínculo Usuario-Jugador (Completado ✅):** 
    - [x] Sistema de solicitudes soporta `jugador-claim`.
    - [x] Lógica de aprobación descentralizada (Admin Global o Admin de Jugador).
    - [x] Mecanismos de seguridad: Transferencia de identidad y liberación de perfil (Un-claim).
-   **Relación entre Aplicaciones:**
    - `Overtime-Public`: El "Frontend Social". Discovery, Claim UI, Perfil Público y **Radar de Atleta** (Gráfico).
    - `Overtime-Manager`: El "Panel de Control". Gestión de Staff (Admins), Fichajes, Edición de Bio y Documentación legal.
-   **Seguridad de Identidad (Completado ✅):** 
    - [x] Endpoint para transferir perfil directamente (Self-transfer).
    - [x] Botón de emergencia para administradores (Identity Release).

---

### 3. Activación de Datos (Completado ✅)
-   **Recalculación Histórica:** Script implementado para barrer la base de datos y generar el Rank Maestro Inicial basado en partidos antiguos (Respetando multiplicadores 0.3x y 1.0x).
-   **Administración Central:** Panel "Ranking" en `Overtime-Admin` para ejecutar la lógica y ver el status del plan de expansión.

---

### 4. Próximo Paso Inmediato: El Radar de Atleta
-   **Visualización (Frontend 🛠️):** Implementar en `Overtime-Public` el gráfico de radar que visualiza las stats del jugador basadas en su ELO y desempeño (Power, Stamina, Consistency, etc).

---

### 5. Visión Futura: El Hub "La Plaza" (App Public)
Transformar la aplicación en una plataforma social y participativa.

#### A. Central de Partidos "La Plaza"
- [ ] **Sistema de Lobbies:** Permitir que usuarios creen partidos abiertos en ubicaciones físicas.
- [ ] **Geolocalización:** Mapa de partidos de plaza activos y competencias verificadas cercanas.
- [ ] **Mecánica de Slot:** Botón "Unirse al Partido" con límite de cupos (Ej: 12/12 jugadores).
- [ ] **Validación de Resultados:** Sistema de carga por capitán + confirmación del equipo rival (Doble Check) para otorgar el 0.3x de ELO.

#### B. Perfil de Atleta 2.0
- [ ] **Dashboard Maestro:** Nueva sección principal en el perfil con la "Carta de Jugador" consolidada.
- [ ] **Radar de Atleta:** Gráfico de habilidades basado en estadísticas (Habilidad, Consistencia, Karma, Nivel de Rivales).
- [ ] **Historial Unificado:** Pestaña de historial que diferencie claramente partidos de Liga vs. Plaza.

---

### 3. Identidad y Confianza (Siguiente Sprint)
- [ ] **Reclamo de Perfil:** Permitir que usuarios registrados vinculen su cuenta con un "Jugador Fantasma" histórico.
- [ ] **Sistema de Karma (Fair Play):** Puntuación de reputación otorgada por otros jugadores tras partidos de plaza.
- [ ] **Multiplicadores Dinámicos:** Ajustar el 0.3x según el Karma promedio del lobby (A mayor confianza, mayor impacto en el ranking).

---

### 4. Estrategia de Monetización (SaaS)
- [ ] **Panel de Verificación:** Dashboard para administradores para gestionar solicitudes de "Organización Verificada".
- [ ] **Pago Integrado:** Gateway de pago para suscripciones de organizaciones y registro de torneos.

---

## 📅 Hoja de Ruta Actualizada

### Fase 1: Cimientos (COMPLETADO)
- Implementación de lógica de 3 niveles y multiplicadores en `ratingService`.
- Creación de campos de verificación en Organizaciones.

### Fase 2: Participación (EN PROCESO)
- Diseño del Lobby de Plazas en App Public.
- Implementación del Hub de Rankings Globales.

### Fase 3: Comunidad (FUTURO)
- Notificaciones push de partidos cercanos.
- Chat de lobby y sistema de clanes/equipos estables.

---
> *"De la plaza al mundo: El ranking es el lenguaje universal del Dodgeball."*
