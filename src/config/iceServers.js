/**
 * ICE Server Configuration for WebRTC
 * 
 * STUN: Used for NAT traversal when direct P2P is possible
 * TURN: Relay server for when direct connection fails (4G, restrictive NAT)
 * 
 * For production, set METERED_USERNAME and METERED_CREDENTIAL in .env
 * Get free credentials at: https://www.metered.ca/tools/openrelay/
 */

const iceServers = [
  // Google STUN servers (free, always available)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// Add TURN servers if credentials are configured
if (process.env.METERED_USERNAME && process.env.METERED_CREDENTIAL) {
  const domain = process.env.METERED_USERNAME; // e.g., overtime-dodgeball.metered.live
  const credential = process.env.METERED_CREDENTIAL;
  
  iceServers.push(
    // Metered.ca STUN
    {
      urls: `stun:${domain}:80`
    },
    // Metered.ca TURN over UDP
    {
      urls: `turn:${domain}:80`,
      username: domain,
      credential: credential
    },
    // Metered.ca TURN over TCP (fallback for restrictive firewalls)
    {
      urls: `turn:${domain}:443`,
      username: domain,
      credential: credential
    },
    // Metered.ca TURNS (TLS, most compatible)
    {
      urls: `turns:${domain}:443`,
      username: domain,
      credential: credential
    }
  );
}

// Valid camera slots
const CAMERA_SLOTS = ['cam1', 'cam2', 'cam3', 'cam4'];

// Video quality presets
const VIDEO_PRESETS = {
  low: { width: 640, height: 360, frameRate: 24, bitrate: 800000 },
  medium: { width: 1280, height: 720, frameRate: 30, bitrate: 2500000 },
  high: { width: 1920, height: 1080, frameRate: 30, bitrate: 5000000 }
};

export { iceServers, CAMERA_SLOTS, VIDEO_PRESETS };
export default iceServers;
