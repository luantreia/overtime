# 🏟️ Proyecto: "La Plaza" - El Motor del Dodgeball Callejero

## 📋 Visión General
"La Plaza" es el componente social y participativo de Overtime que permite descentralizar el deporte. El objetivo es que cualquier grupo de personas pueda organizar partidos con validez oficial para el Ranking Global (Nivel 1) con un multiplicador de **0.3x**, sin necesidad de una organización formal detrás.

---

## 🛠️ Componentes Clave

### 1. El Sistema de Lobbies (Punto de Encuentro)
Permite pasar de la intención a la acción.
- **Creación de Lobby:** Un "Host" define ubicación, tipo de bola y cupos (Estándar de **18 jugadores totales**, 9 por bando).
- **Gestión de Cupos y Sorteo:** 
    - Si hay más de 18 interesados, el sistema permite al Host seleccionar a los participantes por **Orden de Llegada** (First-come, first-served), **Sorteo Automático** o priorización por **Karma**.
    - Los que no entran pasan a una **Lista de Espera** dinámica.
- **Matchmaking Equitativo:** El Host puede disparar un "Auto-Balanceo" que reparte a los 18 jugadores en dos equipos (A y B) buscando que el promedio de ELO sea equitativo. Todos los participantes son considerados "Jugadores" de pleno derecho, alternando funciones de cancha y recolección (shaggers) de forma orgánica.
- **Estado de Preparación:** Todos los jugadores deben confirmar su asistencia digitalmente (Check-in) al llegar al lugar físico.

### 2. Roles de Oficiales y Staff
Para dar seriedad profesional incluso en la plaza.
- **Slots para Árbitros:** Posibilidad de abrir cupos para:
    - 1 Árbitro Principal (Lleva el marcador oficial y cierra el partido).
    - 1 Segundo Árbitro.
    - Hasta 4 Jueces de Línea.
- **Elección del Capitán Rival:** Al iniciar el partido oficialmente, el sistema designa automáticamente como **Capitán Rival** al jugador del Equipo B con el **Karma más alto** (basado en su historial de conducta). Él adquiere la autoridad para el Doble Check.
- **Reputación de Staff:** Los oficiales ganan Karma específico de arbitraje, lo que les permite ser "vistos" por organizaciones oficiales.
- **Validación de Resultados:** Si hay un Árbitro Principal presente, él tiene la prioridad para cargar el resultado final (Doble Check Simplificado). Si no hay árbitro, se mantiene el **Consenso (2 de 3)** entre el Host, el Capitán Rival y el Árbitro.

### 3. Dinámica de Juego y Sets
- **Registro Set a Set:** Interfaz simplificada para que el Árbitro o el Host marquen el ganador de cada set en tiempo real.
- **Cierre de Partido:** El sistema permite definir condiciones de victoria (Ej: "A ganar 4 sets" o "Tiempo corrido de 40 mins").

### 4. Sistema de Karma y Seguridad
- **Cercanía GPS (Geofencing):** El Check-in solo se activa si el usuario está en un radio de 100m del punto de encuentro.
- **Multa por No-Show (Penalización Triple):** Si un jugador confirmado no realiza el Check-in:
    1.  **Karma:** Baja de reputación automática y drástica.
    2.  **ELO (AFK):** Se procesa como abandono. Pierde ELO automáticamente (doble penalización del equipo perdedor) incluso si su equipo gana.
    3.  **Radar:** La métrica de *Consistency* y *Stamina* se ven afectadas negativamente en el perfil público.
- **Votación Post-Partido:** Evaluación mutua de Fair Play (👍/👎).
- **Impacto en Ranking:** El 0.3x es el base. Con un árbitro oficial de plaza, el impacto podría subir a **0.5x** debido a la mayor confiabilidad de los datos.

---

## 📐 Especificaciones Técnicas (Backend)

### Nuevos Modelos de Datos
- `Lobby`: `id`, `hostId`, `location`, `players[]`, `status` (open, full, playing, finished), `marcador`.
- `KarmaLog`: Registro de interacciones de conducta.
- `Location`: `nombre`, `coordenadas`, `fotos`, `comodidades` (luz, techado, baños).

### Reglas de Negocio del 0.3x
- **Mínimo de Jugadores:** Se requieren al menos 6 jugadores reales (verificados) para que el lobby otorgue ELO.
- **Cercanía GPS:** (Opcional) Validar que los jugadores estén en un radio de 500m del punto del lobby al momento de iniciar para evitar "partidos fantasma".

---

## 📅 Roadmap de Implementación

### Fase 1: MVP de Lobbies (La Lista)
- [x] Backend: Modelo de Lobbies robusto (18 slots + Oficiales) y Endpoints CRUD.
- [ ] Frontend Public: Lista de lobbies activos y botón "Unirse".
- [x] Integración con Ranking: El flujo de finalización mediante consenso dispara el `applyRankedResult` (0.3x / 0.5x).

### Fase 2: Confianza y Karma
- [x] Backend: Lógica de **Consenso 2 de 3** (Host, Capitán Rival y Árbitro).
- [x] Backend: Sistema de Geofencing para Check-in GPS y detección de AFK.
- [ ] Sistema de confirmación cruzada de resultados (Frontend).
- [ ] Interfaz de calificación de jugadores post-partido (Karma).
- [ ] Dashboard de Karma en el Perfil de Atleta.

### Fase 3: El Mapa y Discovery
- [ ] Integración con Google Maps / Leaflet.
- [ ] Notificaciones Push: "Hay un partido de Foam cerca de tu ubicación en 1 hora".

---
> *"El Dodgeball nace en la plaza, se pule en la liga y se consagra en el Ranking Global."*
