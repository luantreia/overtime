import { create } from 'timrjs/es/timr.js';
import Partido from '../models/Partido/Partido.js';
import SetPartido from '../models/Partido/SetPartido.js';

class TimerManager {
  constructor() {
    // Structure:
    // matchId -> {
    //   matchTimer: Timr,
    //   setTimer: Timr,
    //   suddenDeathTimer: Timr,
    //   state: {
    //     period: number,
    //     isMatchRunning: boolean,
    //     isSetRunning: boolean,
    //     isSuddenDeathActive: boolean,
    //     suddenDeathMode: boolean
    //   }
    // }
    this.matches = new Map();
    this.io = null;
  }

  initialize(io) {
    this.io = io;
  }

  getMatchState(matchId) {
    return this.matches.get(matchId);
  }

  async ensureMatchLoaded(matchId) {
    if (this.matches.has(matchId)) return this.matches.get(matchId);

    // Load from DB
    const match = await Partido.findById(matchId);
    if (!match) throw new Error('Match not found');

    // Get the latest active set (in case multiple are active, pick the newest)
    const activeSet = await SetPartido.findOne({ partido: matchId, estadoSet: 'en_juego' })
      .sort({ numeroSet: -1 });

    // Initialize Timers
    // Match Timer (Countdown)
    const matchTimer = create(match.timerMatchValue || 0, { countdown: true });
    
    // Set Timer (Countdown) - Default to 180s (3 min) for new sets
    const setTimer = create(activeSet?.timerSetValue ?? 180, { countdown: true });

    // Sudden Death (Stopwatch - counts up)
    const suddenDeathTimer = create(activeSet?.timerSuddenDeathValue ?? 0, { countdown: false }); 

    const state = {
      period: match.period || 1,
      isMatchRunning: false, // Always load paused to avoid ghost running after restart
      isSetRunning: false,
      isSuddenDeathActive: false,
      suddenDeathMode: activeSet?.suddenDeathMode || false,
      modalidad: match.modalidad
    };

    const matchData = { matchTimer, setTimer, suddenDeathTimer, state };
    this.matches.set(matchId, matchData);

    // Setup Tickers
    this.setupTickers(matchId);

    return matchData;
  }

  setupTickers(matchId) {
    const data = this.matches.get(matchId);
    if (!data) return;

    const { matchTimer, setTimer, suddenDeathTimer } = data;

    // Helper to emit update (only if timer is actually running to avoid spam)
    const emitUpdate = () => {
      if (!this.io) return;
      
      const payload = {
        matchId,
        matchRemaining: matchTimer.getRaw().SS, // raw seconds
        setRemaining: setTimer.getRaw().SS,
        suddenDeathRemaining: suddenDeathTimer.getRaw().SS,
        period: data.state.period,
        isMatchRunning: matchTimer.started(),
        isSetRunning: setTimer.started(),
        isSuddenDeathActive: suddenDeathTimer.started(),
        suddenDeathMode: data.state.suddenDeathMode,
        serverTimestamp: Date.now()
      };

      this.io.to(matchId).emit('timer:update', payload);
    };

    // Attach tickers (timrjs replaces existing ticker on each call, so no duplicates)
    matchTimer.ticker(() => emitUpdate());
    setTimer.ticker(() => emitUpdate());
    suddenDeathTimer.ticker(() => emitUpdate());
    
    // Also emit on finish/stop
    matchTimer.finish(() => emitUpdate());
    setTimer.finish(() => {
        if (data.state.modalidad === 'Foam') {
            if (!data.suddenDeathTimer.started()) {
                data.suddenDeathTimer.start();
                data.state.isSuddenDeathActive = true;
                data.state.suddenDeathMode = true;
                this.persistSet(matchId);
            }
        }
        emitUpdate();
    });
  }

  // --- Actions ---

  async startMatch(matchId) {
    const data = await this.ensureMatchLoaded(matchId);
    if (!data.matchTimer.started()) {
        data.matchTimer.start();
        data.state.isMatchRunning = true;
        this.emitState(matchId);
    }
  }

  async pauseMatch(matchId) {
    const data = await this.ensureMatchLoaded(matchId);
    if (data.matchTimer.started()) {
        data.matchTimer.pause();
        data.state.isMatchRunning = false;
        this.emitState(matchId);
        this.persistMatch(matchId);
    }
  }

  async setMatchTime(matchId, seconds) {
    const data = await this.ensureMatchLoaded(matchId);
    
    // Stop and destroy old timer
    data.matchTimer.stop();
    data.matchTimer.destroy();
    
    // Recreate with new time
    data.matchTimer = create(seconds, { countdown: true });
    data.state.isMatchRunning = false;
    
    // Re-setup tickers
    this.setupTickers(matchId);
    
    this.emitState(matchId);
    this.persistMatch(matchId);
  }

  async changePeriod(matchId, period) {
      const data = await this.ensureMatchLoaded(matchId);
      data.state.period = period;
      // Usually changing period resets match time?
      // For now just update period.
      this.emitState(matchId);
      this.persistMatch(matchId);
  }

  // --- Set Actions ---

  async startSet(matchId) {
      const data = await this.ensureMatchLoaded(matchId);
      if (!data.setTimer.started()) {
          data.setTimer.start();
          data.state.isSetRunning = true;
          
          // Record start time for statistics
          const activeSet = await SetPartido.findOne({ partido: matchId, estadoSet: 'en_juego' });
          if (activeSet && !activeSet.iniciadoEn) {
              activeSet.iniciadoEn = new Date();
              await activeSet.save();
          }
          
          this.emitState(matchId);
      }
  }

  async pauseSet(matchId) {
      const data = await this.ensureMatchLoaded(matchId);
      if (data.setTimer.started()) {
          data.setTimer.pause();
          data.state.isSetRunning = false;
          this.emitState(matchId);
          this.persistSet(matchId);
      }
  }

  async setSetTime(matchId, seconds) {
      const data = await this.ensureMatchLoaded(matchId);
      
      // Stop and destroy old timer
      data.setTimer.stop();
      data.setTimer.destroy();
      
      // Recreate with new time
      data.setTimer = create(seconds, { countdown: true });
      data.state.isSetRunning = false;
      
      // Re-setup tickers
      this.setupTickers(matchId);
      
      this.emitState(matchId);
      this.persistSet(matchId);
  }

  // --- Sudden Death Actions ---

  async setSuddenDeathMode(matchId, enabled) {
      const data = await this.ensureMatchLoaded(matchId);
      data.state.suddenDeathMode = enabled;
      this.emitState(matchId);
      this.persistSet(matchId);
  }

  async startSuddenDeath(matchId) {
      const data = await this.ensureMatchLoaded(matchId);
      if (!data.suddenDeathTimer.started()) {
          data.suddenDeathTimer.start();
          data.state.isSuddenDeathActive = true;
          this.emitState(matchId);
      }
  }

  async stopSuddenDeath(matchId) {
      const data = await this.ensureMatchLoaded(matchId);
      if (data.suddenDeathTimer.started()) {
          data.suddenDeathTimer.pause(); // Pause, don't stop (stop resets to start)
          data.state.isSuddenDeathActive = false;
          this.emitState(matchId);
          this.persistSet(matchId);
      }
  }

  // --- Global Actions ---

  async pauseAll(matchId) {
      const data = await this.ensureMatchLoaded(matchId);
      
      // Only pause timers that are actually running to avoid timrjs errors
      if (data.matchTimer.started()) {
          data.matchTimer.pause();
      }
      data.state.isMatchRunning = false;
      
      if (data.setTimer.started()) {
          data.setTimer.pause();
      }
      data.state.isSetRunning = false;
      
      if (data.suddenDeathTimer.started()) {
          data.suddenDeathTimer.pause();
      }
      data.state.isSuddenDeathActive = false;

      // Always emit and persist to ensure client is in sync
      this.emitState(matchId);
      this.persistMatch(matchId);
      this.persistSet(matchId);
  }

  // Pause only set and sudden death timers (used when finishing a set)
  async pauseSetOnly(matchId, isFinishing = false) {
      const data = await this.ensureMatchLoaded(matchId);
      
      if (data.setTimer.started()) {
          data.setTimer.pause();
      }
      data.state.isSetRunning = false;
      
      if (data.suddenDeathTimer.started()) {
          data.suddenDeathTimer.pause();
      }
      data.state.isSuddenDeathActive = false;

      this.emitState(matchId);
      this.persistSet(matchId, isFinishing);
  }

  async resetAll(matchId) {
      const data = await this.ensureMatchLoaded(matchId);
      
      // Stop and destroy all timers
      data.matchTimer.stop();
      data.setTimer.stop();
      data.suddenDeathTimer.stop();
      data.matchTimer.destroy();
      data.setTimer.destroy();
      data.suddenDeathTimer.destroy();

      // Recreate timers with default values
      data.matchTimer = create(20 * 60, { countdown: true }); // 20 mins
      data.setTimer = create(3 * 60, { countdown: true }); // 3 mins
      data.suddenDeathTimer = create(0, { countdown: false }); // 0 secs

      // Setup tick handlers again
      this.setupTickers(matchId);

      // Reset state
      data.state.isMatchRunning = false;
      data.state.isSetRunning = false;
      data.state.isSuddenDeathActive = false;
      data.state.suddenDeathMode = false;
      data.state.period = 1;

      this.emitState(matchId);
      this.persistMatch(matchId);
      this.persistSet(matchId);
  }

  emitState(matchId) {
    // Manual emit (e.g. after pause/start)
    const data = this.matches.get(matchId);
    if (!data || !this.io) return;
    
    const payload = {
        matchId,
        matchRemaining: data.matchTimer.getRaw().SS,
        setRemaining: data.setTimer.getRaw().SS,
        suddenDeathRemaining: data.suddenDeathTimer.getRaw().SS,
        period: data.state.period,
        isMatchRunning: data.matchTimer.started(),
        isSetRunning: data.setTimer.started(),
        isSuddenDeathActive: data.suddenDeathTimer.started(),
        suddenDeathMode: data.state.suddenDeathMode,
        serverTimestamp: Date.now()
    };
    this.io.to(matchId).emit('timer:update', payload);
  }

  async persistMatch(matchId) {
      const data = this.matches.get(matchId);
      if (!data) return;
      
      try {
        await Partido.findByIdAndUpdate(matchId, {
            timerMatchValue: data.matchTimer.getRaw().SS,
            timerMatchRunning: data.matchTimer.started(),
            timerMatchLastUpdate: new Date(),
            period: data.state.period
        });
      } catch (err) {
          console.error('Error persisting match timer:', err);
      }
  }

  async persistSet(matchId, isFinishing = false) {
      const data = this.matches.get(matchId);
      if (!data) return;

      try {
        const activeSet = await SetPartido.findOne({ partido: matchId, estadoSet: 'en_juego' });
        if (activeSet) {
            activeSet.timerSetValue = data.setTimer.getRaw().SS;
            activeSet.timerSetRunning = data.setTimer.started();
            activeSet.timerSetLastUpdate = new Date();
            activeSet.timerSuddenDeathValue = data.suddenDeathTimer.getRaw().SS;
            activeSet.timerSuddenDeathRunning = data.suddenDeathTimer.started();
            activeSet.suddenDeathMode = data.state.suddenDeathMode;
            
            // Calculate duration statistics when finishing
            if (isFinishing && activeSet.iniciadoEn) {
                activeSet.finalizadoEn = new Date();
                activeSet.duracionReal = Math.floor((activeSet.finalizadoEn - activeSet.iniciadoEn) / 1000);
                activeSet.duracionSetTimer = 180 - activeSet.timerSetValue; // Time used from the 3:00
                if (activeSet.suddenDeathMode) {
                    activeSet.duracionSuddenDeath = activeSet.timerSuddenDeathValue;
                }
            }
            
            await activeSet.save();
        }
      } catch (err) {
          console.error('Error persisting set timer:', err);
      }
  }

  async reloadMatch(matchId, suppressEmit = false) {
    // Get current data to preserve match timer state
    const existingData = this.matches.get(matchId);
    
    // Get fresh set data from DB
    const activeSet = await SetPartido.findOne({ partido: matchId, estadoSet: 'en_juego' })
        .sort({ numeroSet: -1 });
    
    if (!existingData) {
        // First load - just use ensureMatchLoaded
        await this.ensureMatchLoaded(matchId);
        if (!suppressEmit) {
            this.emitState(matchId);
        }
        return;
    }
    
    // PRESERVE match timer - only recreate set timers
    // Cleanup old SET timers only
    existingData.setTimer.stop();
    existingData.setTimer.destroy();
    existingData.suddenDeathTimer.stop();
    existingData.suddenDeathTimer.destroy();
    
    if (activeSet) {
        // Recreate set timers with DB values
        existingData.setTimer = create(activeSet.timerSetValue ?? 180, { countdown: true });
        existingData.suddenDeathTimer = create(activeSet.timerSuddenDeathValue ?? 0, { countdown: false });
        
        existingData.state.suddenDeathMode = activeSet.suddenDeathMode ?? false;
        existingData.state.isSetRunning = activeSet.timerSetRunning ?? false;
        existingData.state.isSuddenDeathActive = activeSet.timerSuddenDeathRunning ?? false;
        
        // If timers were running, restart them
        if (activeSet.timerSetRunning) {
            existingData.setTimer.start();
        }
        if (activeSet.timerSuddenDeathRunning) {
            existingData.suddenDeathTimer.start();
        }
    } else {
        // No active set - reset set timers to default
        existingData.setTimer = create(180, { countdown: true });
        existingData.suddenDeathTimer = create(0, { countdown: false });
        existingData.state.isSetRunning = false;
        existingData.state.isSuddenDeathActive = false;
        existingData.state.suddenDeathMode = false;
    }
    
    // Re-setup tickers for the new set timers (match timer keeps its tickers)
    this.setupTickers(matchId);
    
    // Only emit once at the end with final consistent state
    if (!suppressEmit) {
        this.emitState(matchId);
    }
  }
}

export default new TimerManager();

