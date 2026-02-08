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

-   **Identidad y Confianza (Completado ✅)**
-   **Modelo de Jugador (Completado ✅):** Ya existen campos `userId`, `perfilReclamado` y lógica de seguridad.
-   **Vínculo Usuario-Jugador (Completado ✅):** 
    - [x] Sistema de solicitudes soporta `jugador-claim`.
    - [x] Lógica de aprobación descentralizada (Admin Global o Admin de Jugador).
    - [x] Mecanismos de seguridad: Transferencia de identidad y liberación de perfil (Un-claim).
    - [x] **Restricción 1-a-1:** Implementada lógica técnica que impide que un `userId` posea más de un `Jugador` (Evita multi-cuentas).
-   **Relación entre Aplicaciones:**
    - `Overtime-Public`: El "Frontend Social". Discovery, Claim UI, Perfil Público y **Radar de Atleta** (Gráfico).
    - `Overtime-Manager`: El "Panel de Control". Gestión de Staff (Admins), Fichajes, Edición de Bio y Documentación legal.
-   **Seguridad de Identidad (Completado ✅):** 
    - [x] Endpoint para transferir perfil directamente (Self-transfer).
    - [x] Botón de emergencia para administradores (Identity Release).
    - [x] **Verificación Blindada:** Solo usuarios con rol `admin` pueden marcar organizaciones como `verificada`.

---

### 3. Activación de Datos (Completado ✅)
-   **Recalculación Histórica:** Script implementado para barrer la base de datos y generar el Rank Maestro Inicial basado en partidos antiguos (Respetando multiplicadores 0.3x y 1.0x).
-   **Administración Central:** Panel "Ranking" en `Overtime-Admin` para ejecutar la lógica y ver el status del plan de expansión.

---

### 4. Radar de Atleta (Completado ✅)
-   **Visualización (Frontend ✅):** Implementado en `Overtime-Public`. Un gráfico dinámico que sintetiza el perfil del jugador.
-   **Métricas Inteligentes:**
    - `Power`: ELO absoluto.
    - `Stamina (Ritmo)`: 50% historia + 50% actividad últimos 30 días.
    - `Consistency`: Estabilidad del Delta.
    - `Precision`: Winrate real.
    - `Versatility`: Diversidad de competencias.

---

### 5. Visión Futura: El Hub "La Plaza" (App Public)
Transformar la aplicación en una plataforma social y participativa.

#### A. Central de Partidos "La Plaza" (EN INICIO TÉCNICO 🏗️)
- [x] **Infraestructura Backend:** Modelos de `Lobby` y `KarmaLog` creados.
- [x] **API del Doble Check:** Endpoints de carga y confirmación mutua implementados.
- [ ] **Geolocalización:** Mapa de partidos de plaza activos y competencias verificadas cercanas.
- [ ] **Mecánica de Slot:** Botón "Unirse al Partido" con límite de cupos (Frontend).

#### B. Perfil de Atleta 2.0
- [x] **Radar de Atleta:** Gráfico de habilidades basado en estadísticas.
- [x] **Estado No-Rankeado (Refinado ⭐):** ELO base 0 para jugadores nuevos (honestidad deportiva) y corrección de paleta de colores `brand` en la UI.
- [ ] **Dashboard Maestro:** Nueva sección principal en el perfil con la "Carta de Jugador" consolidada.
- [ ] **Historial Unificado:** Pestaña de historial que diferencie claramente partidos de Liga vs. Plaza.

---

### 6. Identidad y Confianza (Siguiente Sprint)
- [x] **Reclamo de Perfil:** Implementado sistema de `jugador-claim` con seguridad.
- [ ] **Sistema de Karma (Fair Play):** Puntuación de reputación otorgada por otros jugadores tras partidos de plaza.
- [ ] **Multiplicadores Dinámicos:** Ajustar el 0.3x según el Karma promedio del lobby (A mayor confianza, mayor impacto en el ranking).

---

### 7. Estrategia de Monetización (SaaS)
- [ ] **Panel de Verificación:** Dashboard para administradores para gestionar solicitudes de "Organización Verificada".
- [ ] **Pago Integrado:** Gateway de pago para suscripciones de organizaciones y registro de torneos.

---

## 📅 Hoja de Ruta Actualizada

### Fase 1: Cimientos (COMPLETADO)
- Implementación de lógica de 3 niveles y multiplicadores en `ratingService`.
- Creación de campos de verificación en Organizaciones.
- HARDENING: Seguridad de rutas críticas (API).

### Fase 2: Identidad y Visualización (COMPLETADO ⭐)
- Sistema de Identidad Segura (Claim/Release/Transfer).
- Athlete Radar con métricas de ritmo dinámico.
- Recalculador Global Maestro.

### Fase 3: Participación "La Plaza" (EN DESARROLLO)
- Diseño del Lobby de Plazas en App Public.
- Geolocalización de partidos.
- Karma y Validación Social.

---
> *"De la plaza al mundo: El ranking es el lenguaje universal del Dodgeball."*
