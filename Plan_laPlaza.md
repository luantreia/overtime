# 🏟️ Proyecto: "La Plaza" - El Motor del Dodgeball Callejero

## 📋 Visión General
"La Plaza" es el componente social y participativo de Overtime que permite descentralizar el deporte. El objetivo es que cualquier grupo de personas pueda organizar partidos con validez oficial para el Ranking Global (Nivel 1) con un multiplicador de **0.3x** (0.5x con arbitraje), sin necesidad de una organización formal detrás.

---

## 🛠️ Componentes Clave

### 1. El Sistema de Lobbies (Punto de Encuentro)
Permite pasar de la intención a la acción.
- [x] **Creación de Lobby:** Un "Host" define ubicación, tipo de bola y cupos. (Leaflet Map integrado para coordenadas precisas).
- [x] **Gestión de Cupos y Sorteo:** 
    - [x] Cupos estándar de 18 jugadores.
    - [x] Auto-asignación balanceada por bando (Algoritmo de paridad numérica).
- [x] **Matchmaking Equitativo:** 
    - [x] Algoritmo Greedy que balancea prioridad numérica (ej: 1v1, 2v2) y luego ELO acumulado.
- [x] **Estado de Preparación:** 
    - [x] Check-in GPS (Geofencing 150m) con icono de escudo de verificación.

### 2. Roles de Oficiales y Staff
Para dar seriedad profesional incluso en la plaza.
- [x] **Slots para Árbitros:** Cupos para Principal, Secundario y 4 Líneas.
- [x] **Elección del Capitán Rival:** Designación automática del jugador con mayor Karma del Equipo B. Badge visual de "CAPITÁN".
- [x] **Reputación de Staff:** Visibilidad de ELO/Karma de árbitros antes de unirse y capacidad de expulsión por parte del Host.
- [x] **Validación de Resultados:** Consenso 2 de 3 con capacidad de **CORRECCIÓN** del Host antes de la firma rival.

### 3. Dinámica de Juego y Sets
- [x] **Registro Set a Set:** Interfaz de carga de sets que suma victorias para el resultado final automático.
- [x] **Cierre de Partido:** Aplicación atómica de ELO Post-Consenso mediante `applyRankedResult`.
- [x] **Rollback de Seguridad:** Herramienta de Administrador (`revertRankedResult`) para deshacer partidos mal reportados sin corromper el ranking.

### 4. Sistema de Karma y Seguridad
- [x] **Cercanía GPS (Geofencing):** Radio de 150m mandatorio para habilitar inicio.
- [x] **Multa por No-Show (Penalización Triple):** Lógica de AFK automática para quienes no validan GPS antes del inicio.
- [ ] **Votación Post-Partido:** Evaluación mutua de Fair Play (👍/👎).
- [x] **Impacto en Ranking:** 0.3x base. 0.5x si un oficial validado por Karma confirma el resultado.

---

## � Roadmap de Implementación

### Fase 1: MVP de Lobbies (COMPLETADO ⭐)
- [x] Backend robusto y Endpoints de flujo de vida del partido.
- [x] Frontend Public: Explorar, Crear, Lobby y Reporte.
- [x] Integración con Ranking Global 0.3x/0.5x.

### Fase 2: Confianza y Karma (100% COMPLETADO ⭐)
- [x] Consenso 2 de 3 con badges de identificación (Host/Capitán).
- [x] Geofencing para Check-in GPS.
- [x] Interfaz de corrección de resultados y visualización previa (Host/Captain cross-team).
- [x] Dashboard de Karma en el Perfil de Atleta: Visualización de conducta y partidos de plaza.

### Fase 3: El Mapa y Discovery (50% COMPLETADO)
- [x] Integración con Leaflet en creación.
- [x] Vista de Mapa en "Explorar Lobbies" con geolocalización de usuario.
- [ ] Notificaciones Push proximidad.

---
> *"El Dodgeball nace en la plaza, se pule en la liga y se consagra en el Ranking Global."*
