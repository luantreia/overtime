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

    const activeSet = await SetPartido.findOne({ partido: matchId, estadoSet: 'en_juego' });

    // Initialize Timers
    // Match Timer (Countdown)
    const matchTimer = create(match.timerMatchValue || 0, { countdown: true });
    
    // Set Timer (Countdown)
    const setTimer = create(activeSet?.timerSetValue || 0, { countdown: true });

    // Sudden Death (Stopwatch - counts up)
    // timrjs stopwatch starts at 0. If we have a value, we might need to offset it or use a custom approach.
    const suddenDeathTimer = create(activeSet?.timerSuddenDeathValue || 0, { countdown: false }); 

    const state = {
      period: match.period || 1,
      isMatchRunning: false, // Always load paused to avoid ghost running after restart
      isSetRunning: false,
      isSuddenDeathActive: false,
      suddenDeathMode: activeSet?.suddenDeathMode || false
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

    // Helper to emit update
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

    // Attach tickers
    matchTimer.ticker(() => emitUpdate());
    setTimer.ticker(() => emitUpdate());
    suddenDeathTimer.ticker(() => emitUpdate());
    
    // Also emit on finish/stop
    matchTimer.finish(() => emitUpdate());
    setTimer.finish(() => emitUpdate());
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
    data.matchTimer.stop(); // Stop to reset
    data.matchTimer.setStartTime(seconds);
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
      data.setTimer.stop();
      data.setTimer.setStartTime(seconds);
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
      
      let changed = false;
      if (data.matchTimer.started()) {
          data.matchTimer.pause();
          data.state.isMatchRunning = false;
          changed = true;
      }
      if (data.setTimer.started()) {
          data.setTimer.pause();
          data.state.isSetRunning = false;
          changed = true;
      }
      if (data.suddenDeathTimer.started()) {
          data.suddenDeathTimer.pause();
          data.state.isSuddenDeathActive = false;
          changed = true;
      }

      if (changed) {
          this.emitState(matchId);
          this.persistMatch(matchId);
          this.persistSet(matchId);
      }
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

  async persistSet(matchId) {
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
            await activeSet.save();
        }
      } catch (err) {
          console.error('Error persisting set timer:', err);
      }
  }

  async reloadMatch(matchId) {
    this.matches.delete(matchId);
    await this.ensureMatchLoaded(matchId);
    this.emitState(matchId);
  }
}

export default new TimerManager();

