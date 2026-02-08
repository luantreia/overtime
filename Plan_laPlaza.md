# 🏟️ Proyecto: "La Plaza" - El Motor del Dodgeball Callejero

## 📋 Visión General
"La Plaza" es el componente social y participativo de Overtime que permite descentralizar el deporte. El objetivo es que cualquier grupo de personas pueda organizar partidos con validez oficial para el Ranking Global (Nivel 1) con un multiplicador de **0.3x**, sin necesidad de una organización formal detrás.

---

## 🛠️ Componentes Clave

### 1. El Sistema de Lobbies (Punto de Encuentro)
Permite pasar de la intención a la acción.
- **Creación de Lobby:** Un "Host" define:
    - Geo-ubicación (Mapa).
    - Tipo de Pelota (Cloth/Foam).
    - Cupos (Ej: 12/12).
    - Nivel sugerido (Abierto, Amateur, Avanzado).
- **Matchmaking Manual:** Los jugadores se unen al lobby y pueden chatear antes del encuentro.
- **Estado de Preparación:** Todos los jugadores deben confirmar su asistencia digitalmente al llegar al lugar físico.

### 2. Validación Social: El "Doble Check"
Para evitar fraudes en el 0.3x sin árbitros:
- **Carga de Resultado:** Solo el Host o capitanes asignados pueden cargar el marcador final.
- **Confirmación Obligatoria:** El capitán del equipo contrario debe "Aceptar" el resultado para que el ELO se procese.
- **Disputas:** Si hay conflicto, el partido queda en un estado `Pendiente de Revisión` para que un Admin de Overtime intervenga (o simplemente se anule).

### 3. Sistema de Karma (Fair Play)
La reputación como moneda de cambio para el 0.3x.
- **Votación Post-Partido:** Al finalizar, cada jugador califica el Karma de sus compañeros y rivales (Pulgar arriba/abajo o estrellas).
- **Incumplimiento:** Si alguien se une a un lobby y no asiste (No-Show), su Karma baja drásticamente.
- **Impacto en Ranking:** Jugadores con Karma bajo (tóxicos o tramposos) pierden la capacidad de sumar ELO en partidos de plaza o incluso pueden ser bloqueados de unirse a nuevos lobbies.

### 4. Geolocalización y Mapas
- **Mapa en Tiempo Real:** En la App Public, ver círculos de actividad (Lobbies abiertos hoy).
- **Rutas de Dodgeball:** Guardar "Lugares Favoritos" (Parques, Polideportivos municipales).

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
- [x] Backend: Modelo de Lobbies y Endpoints CRUD básicos (`Lobby.js`, `plaza.js`).
- [ ] Frontend Public: Lista de lobbies activos y botón "Unirse".
- [ ] Integración con Ranking: El flujo de finalización de lobby dispara el `applyRankedResult` con multiplicador `0.3`.

### Fase 2: Confianza y Karma
- [x] Backend: Modelo de Karma (`KarmaLog.js`) y lógica de "Doble Check" inicial.
- [ ] Sistema de confirmación cruzada de resultados (Frontend).
- [ ] Interfaz de calificación de jugadores post-partido.
- [ ] Dashboard de Karma en el Perfil de Atleta.

### Fase 3: El Mapa y Discovery
- [ ] Integración con Google Maps / Leaflet.
- [ ] Notificaciones Push: "Hay un partido de Foam cerca de tu ubicación en 1 hora".

---
> *"El Dodgeball nace en la plaza, se pule en la liga y se consagra en el Ranking Global."*
