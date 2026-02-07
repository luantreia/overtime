# 🌎 Overtime: Plan de Expansión Global
## Visión: La Federación Digital del Dodgeball

Overtime no es solo un gestor de torneos; es la **infraestructura de confianza** que conectará a todos los jugadores de Dodgeball del mundo, desde una plaza en Buenos Aires hasta el mundial en Europa. Nuestra visión es convertirnos en la **Federación Digital** que unifica el deporte mediante datos, identidad y meritocracia.

---

### 1. El Sistema de Rankings (La Triple Vara)
Para profesionalizar el deporte, el progreso de un jugador se mide en tres dimensiones:
1.  **Rank Temporada (Corto Plazo):** El ranking vivo de un torneo/ciclo específico. Permite que nuevos talentos lleguen a la cima cada pocos meses.
2.  **Rank Competencia (Histórico de Liga):** El prestigio acumulado dentro de una organización específica (ej. League of Dodgeball). Suma todos los partidos jugados en ese club.
3.  **Rank Global Maestro (Nivel Mundial):** La "Fuente de Verdad" absoluta. Unifica el desempeño de un jugador en todas las ligas y partidos libres de la app. Es el estándar para el scouting internacional.

---

### 2. El Ecosistema: Plaza vs. Club
*   **La Plaza (Semillero):** Partidos gratuitos y libres. Autorregulados por **doble confirmación de capitanes** y sistema de **reputación (Karma)**. Suma puntos al Rank Global con un multiplicador bajo (0.2x - 0.3x) para incentivar el salto al profesionalismo.
*   **El Club (Estatus Pro):** Organizaciones "Premium" que ofrecen **árbitros, estadísticas pro, streaming y premios**. Otorgan el **100% de los puntos** al Rank Global y certifican la veracidad del nivel del jugador.

---

### 3. Modelo de Negocio: Pay-to-Verify (SaaS)
*   **Software Libre:** Herramientas gratuitas para organizar torneos (brackets, resultados).
*   **Suscripción Premium:** Los clubes pagan para ser **"Organización Verificada"**. Solo los clubes verificados pueden otorgar puntos oficiales al Rank Global Maestro y crear Temporadas.
*   **Marketplace:** Comisiones por gestión de pagos de inscripciones y premios.

---

### 4. La Identidad: Del "Fantasma" al Atleta
*   **Jugador Fantasma:** Perfiles creados por administradores para cargar datos históricos. No tienen dueño.
*   **Usuario Verificado:** Personas reales con cuenta. Pueden **"Reclamar"** sus perfiles fantasma bajo validación, unificando su historial y habilitando su ascenso en el Rank Global.
*   **Managers:** Perfiles con permiso para administrar atletas pro, facilitando la inscripción y gestión de imagen.

---

## 🚀 Plan de Acción Inmediato

### Paso 1: Consolidar la Base (Mañana)
- [ ] **Identidad:** Implementar el campo `userId` en el modelo de `Jugador` y el sistema de `perfilReclamado`.
- [ ] **Vinculación:** Crear endpoint `/claim-player` para que los usuarios busquen y pidan su perfil histórico.
- [ ] **Rank Maestro:** Ejecutar un script único (`recalculate-global`) para alimentar el nuevo Ranking Maestro con todos los partidos cargados hasta hoy.

### Paso 2: Diferenciación de Organizaciones
- [ ] Agregar campo `isVerified` a las Organizaciones.
- [ ] Ajustar el `ratingService` para que los partidos de organizaciones NO verificadas usen el multiplicador de ELO reducido para el Rank Global.

### Paso 3: Perfil Pro y Redes
- [ ] **App Public:** Diseñar la "Carta de Jugador" (FIFA Style) que muestre los 3 rankings y la reputación de Fair Play.
- [ ] **Social Media:** Lanzamiento de IG/TikTok de **Overtime Dodgeball**. Contenido: "Héroes del Ranking", "Jugadas de ELO +20" y el mapa de partidos en plazas.

---

> *"El objetivo no es solo que la gente juegue, es que cada pelota lanzada quede grabada en la historia del deporte."*