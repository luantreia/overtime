import { iceServers, CAMERA_SLOTS } from '../config/iceServers.js';
import logger from '../utils/logger.js';

/**
 * CameraManager - WebRTC Signaling Server for Multi-Camera System
 * 
 * Manages WebRTC signaling between camera sources (mobile phones) and
 * the broadcast compositor. Uses Socket.io rooms per match for isolation.
 * 
 * Architecture:
 * - Each match has isolated camera state
 * - Camera slots are fixed: cam1, cam2, cam3, cam4
 * - One compositor per match receives all camera streams
 * - Signaling only - actual video flows P2P between devices
 */

class CameraManager {
  constructor() {
    // Structure:
    // matchId -> {
    //   cameras: Map<slot, { socketId, label, status, quality }>,
    //   activeSlot: string | null,
    //   compositors: Set<socketId>  // Multiple compositors allowed
    // }
    this.matches = new Map();
    this.io = null;
    
    // Reverse lookup: socketId -> { matchId, role, slot }
    this.socketRegistry = new Map();
  }

  initialize(io) {
    this.io = io;
  }

  /**
   * Get or create match camera state
   */
  getMatchState(matchId) {
    if (!this.matches.has(matchId)) {
      this.matches.set(matchId, {
        cameras: new Map(),
        activeSlot: null,
        compositors: new Set()  // Multiple compositors allowed
      });
    }
    return this.matches.get(matchId);
  }

  /**
   * Get ICE servers configuration for clients
   */
  getIceServers() {
    return iceServers;
  }

  /**
   * Validate camera slot
   */
  isValidSlot(slot) {
    return CAMERA_SLOTS.includes(slot);
  }

  // ==================== Camera Source Actions ====================

  /**
   * Register a camera source (mobile device)
   */
  registerCamera(socketId, matchId, slot, label = '') {
    if (!this.isValidSlot(slot)) {
      return { success: false, error: 'Invalid camera slot' };
    }

    const state = this.getMatchState(matchId);
    
    // Check if slot is already taken by another socket
    const existingCamera = state.cameras.get(slot);
    if (existingCamera && existingCamera.socketId !== socketId) {
      return { success: false, error: 'Slot already in use' };
    }

    // Register the camera
    state.cameras.set(slot, {
      socketId,
      label: label || `Cámara ${slot.replace('cam', '')}`,
      status: 'connecting',
      quality: 'medium',
      connectedAt: Date.now()
    });

    // Register in reverse lookup
    this.socketRegistry.set(socketId, { matchId, role: 'camera', slot });

    // Emit state update to all clients in the match room
    this.emitCameraState(matchId);

    // Notify all compositors to initiate WebRTC connection
    for (const compositorId of state.compositors) {
      this.io.to(compositorId).emit('camera:new_source', {
        matchId,
        slot,
        label: state.cameras.get(slot).label
      });
    }

    return { success: true };
  }

  /**
   * Unregister a camera source
   */
  unregisterCamera(socketId) {
    const registration = this.socketRegistry.get(socketId);
    if (!registration || registration.role !== 'camera') return;

    const { matchId, slot } = registration;
    const state = this.matches.get(matchId);
    
    if (state) {
      state.cameras.delete(slot);
      
      // If this was the active camera, clear active slot
      if (state.activeSlot === slot) {
        state.activeSlot = null;
      }

      // Notify all compositors
      for (const compositorId of state.compositors) {
        this.io.to(compositorId).emit('camera:source_left', {
          matchId,
          slot
        });
      }

      this.emitCameraState(matchId);
    }

    this.socketRegistry.delete(socketId);
  }

  /**
   * Update camera status (connecting, live, error)
   */
  updateCameraStatus(socketId, status) {
    const registration = this.socketRegistry.get(socketId);
    if (!registration || registration.role !== 'camera') return;

    const { matchId, slot } = registration;
    const state = this.matches.get(matchId);
    
    if (state && state.cameras.has(slot)) {
      state.cameras.get(slot).status = status;
      this.emitCameraState(matchId);
    }
  }

  /**
   * Update camera quality setting
   */
  updateCameraQuality(socketId, quality) {
    const registration = this.socketRegistry.get(socketId);
    if (!registration || registration.role !== 'camera') return;

    const { matchId, slot } = registration;
    const state = this.matches.get(matchId);
    
    if (state && state.cameras.has(slot)) {
      state.cameras.get(slot).quality = quality;
      this.emitCameraState(matchId);
    }
  }

  // ==================== Compositor Actions ====================

  /**
   * Register the broadcast compositor (allows multiple)
   */
  registerCompositor(socketId, matchId) {
    const state = this.getMatchState(matchId);
    
    // Add to set of compositors (allows multiple)
    state.compositors.add(socketId);
    this.socketRegistry.set(socketId, { matchId, role: 'compositor' });

    // Send current state and ICE servers
    this.emitCameraState(matchId);
    
    // Request offers from all connected cameras
    for (const [slot, camera] of state.cameras) {
      if (camera.status === 'live' || camera.status === 'connecting') {
        console.log(`Requesting offer from existing camera ${slot} for new compositor`);
        this.io.to(camera.socketId).emit('camera:request_offer', { matchId, slot });
      }
    }
    
    return { 
      success: true, 
      iceServers: this.getIceServers(),
      cameras: this.getCamerasInfo(matchId)
    };
  }

  /**
   * Unregister compositor
   */
  unregisterCompositor(socketId) {
    const registration = this.socketRegistry.get(socketId);
    if (!registration || registration.role !== 'compositor') return;

    const { matchId } = registration;
    const state = this.matches.get(matchId);
    
    if (state) {
      state.compositors.delete(socketId);
    }

    this.socketRegistry.delete(socketId);
  }

  /**
   * Switch active camera
   */
  switchActiveCamera(matchId, slot) {
    const state = this.matches.get(matchId);
    if (!state) return { success: false, error: 'Match not found' };

    if (slot && !state.cameras.has(slot)) {
      return { success: false, error: 'Camera not connected' };
    }

    state.activeSlot = slot;
    try {
      logger.info(`Switch active camera for match ${matchId} -> ${slot}`);
    } catch (e) {
      console.log('[CameraManager] Switch active camera', matchId, slot);
    }
    this.emitCameraState(matchId);
    
    // Notify all clients about the switch
    this.io.to(matchId).emit('camera:switched', { matchId, activeSlot: slot });

    return { success: true };
  }

  // ==================== WebRTC Signaling ====================

  /**
   * Relay WebRTC offer from camera to all compositors
   */
  relayOffer(fromSocketId, matchId, slot, sdp) {
    const state = this.matches.get(matchId);
    if (!state || state.compositors.size === 0) {
      return { success: false, error: 'No compositor connected' };
    }

    // Log and send offer to a single compositor (primary) to avoid duplicate answers
    try {
      logger.info(`Received camera:offer from ${fromSocketId} for match ${matchId} slot ${slot}`);
    } catch (e) {
      console.log('[CameraManager] Received offer', fromSocketId, matchId, slot);
    }
    // Choose a primary compositor (first in the Set)
    const primaryCompositor = state.compositors.values().next().value;
    if (!primaryCompositor) return { success: false, error: 'No compositor connected' };
    if (state.compositors.size > 1) {
      try {
        logger.warn(`Multiple compositors connected for match ${matchId}; forwarding offer for slot ${slot} only to primary ${primaryCompositor}`);
      } catch (e) {
        console.log('[CameraManager] Multiple compositors, forwarding to primary', primaryCompositor);
      }
    }
    this.io.to(primaryCompositor).emit('camera:offer', {
      matchId,
      slot,
      sdp
    });

    return { success: true };
  }

  /**
   * Relay WebRTC answer from compositor to camera
   */
  relayAnswer(fromSocketId, matchId, slot, sdp) {
    const state = this.matches.get(matchId);
    if (!state) return { success: false, error: 'Match not found' };

    const camera = state.cameras.get(slot);
    if (!camera) return { success: false, error: 'Camera not found' };

    try {
      logger.info(`Relaying camera:answer from compositor ${fromSocketId} to camera ${camera.socketId} for match ${matchId} slot ${slot}`);
    } catch (e) {
      console.log('[CameraManager] Relaying answer', fromSocketId, camera?.socketId, matchId, slot);
    }
    this.io.to(camera.socketId).emit('camera:answer', {
      matchId,
      slot,
      sdp
    });

    return { success: true };
  }

  /**
   * Relay ICE candidate between peers
   */
  relayIceCandidate(fromSocketId, matchId, slot, candidate) {
    const registration = this.socketRegistry.get(fromSocketId);
    if (!registration) return;

    const state = this.matches.get(matchId);
    if (!state) return;

    if (registration.role === 'camera') {
      // Camera -> All Compositors
      try {
        logger.info(`ICE candidate from camera ${fromSocketId} for match ${matchId} slot ${slot}`);
      } catch (e) {
        console.log('[CameraManager] ICE from camera', fromSocketId, matchId, slot);
      }
      for (const compositorId of state.compositors) {
        this.io.to(compositorId).emit('camera:ice', {
          matchId,
          slot,
          candidate
        });
      }
    } else if (registration.role === 'compositor') {
      // Compositor -> Camera
      try {
        logger.info(`ICE candidate from compositor ${fromSocketId} for match ${matchId} slot ${slot}`);
      } catch (e) {
        console.log('[CameraManager] ICE from compositor', fromSocketId, matchId, slot);
      }
      const camera = state.cameras.get(slot);
      if (camera) {
        this.io.to(camera.socketId).emit('camera:ice', {
          matchId,
          slot,
          candidate
        });
      }
    }
  }

  // ==================== State Emission ====================

  /**
   * Get cameras info for a match (serializable)
   */
  getCamerasInfo(matchId) {
    const state = this.matches.get(matchId);
    if (!state) return [];

    const cameras = [];
    for (const [slot, camera] of state.cameras) {
      cameras.push({
        slot,
        label: camera.label,
        status: camera.status,
        quality: camera.quality
      });
    }
    return cameras;
  }

  /**
   * Emit current camera state to all clients in the match
   */
  emitCameraState(matchId) {
    if (!this.io) return;

    const state = this.matches.get(matchId);
    if (!state) return;

    const payload = {
      matchId,
      cameras: this.getCamerasInfo(matchId),
      activeSlot: state.activeSlot,
      hasCompositor: state.compositors.size > 0,
      iceServers: this.getIceServers()
    };

    this.io.to(matchId).emit('camera:state', payload);
  }

  // ==================== Cleanup ====================

  /**
   * Handle socket disconnect
   */
  handleDisconnect(socketId) {
    const registration = this.socketRegistry.get(socketId);
    if (!registration) return;

    if (registration.role === 'camera') {
      this.unregisterCamera(socketId);
    } else if (registration.role === 'compositor') {
      this.unregisterCompositor(socketId);
    }
  }

  /**
   * Clean up empty match states (call periodically or on match end)
   */
  cleanupMatch(matchId) {
    const state = this.matches.get(matchId);
    if (!state) return;

    // Disconnect all cameras
    for (const [slot, camera] of state.cameras) {
      this.socketRegistry.delete(camera.socketId);
    }

    // Clear all compositors
    for (const compositorId of state.compositors) {
      this.socketRegistry.delete(compositorId);
    }

    this.matches.delete(matchId);
  }
}

export default new CameraManager();
