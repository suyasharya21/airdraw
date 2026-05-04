
import { HandLandmark, GestureState } from '../types';

/**
 * Calculates Euclidean distance between two 3D landmarks
 */
export const getDistance = (p1: HandLandmark, p2: HandLandmark): number => {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) + 
    Math.pow(p1.y - p2.y, 2) + 
    Math.pow(p1.z - p2.z, 2)
  );
};

/**
 * Main State Machine logic
 */
export const detectGesture = (landmarks: HandLandmark[]): GestureState => {
  if (!landmarks || landmarks.length === 0) return GestureState.IDLE;

  const indexTip = landmarks[8];
  const indexMCP = landmarks[5];
  const middleTip = landmarks[12];
  const middleMCP = landmarks[9];
  const ringTip = landmarks[16];
  const ringMCP = landmarks[13];
  const pinkyTip = landmarks[20];
  const pinkyMCP = landmarks[17];

  const thumbTip = landmarks[4];
  const thumbBase = landmarks[2];

  const wrist = landmarks[0];

  // Robust extension check: Tip is significantly further from wrist than MCP
  const isExtended = (tip: HandLandmark, mcp: HandLandmark, threshold = 1.15) => {
    return getDistance(tip, wrist) > getDistance(mcp, wrist) * threshold;
  };

  const indexExtended = isExtended(indexTip, indexMCP, 1.02); // Even more sensitive for index
  const middleExtended = isExtended(middleTip, middleMCP, 1.25); // Slightly relaxed middle strictness
  const ringExtended = isExtended(ringTip, ringMCP, 1.25);
  const pinkyExtended = isExtended(pinkyTip, pinkyMCP, 1.25);
  
  // Thumb extended check: distance from index base to thumb tip
  const thumbExtended = getDistance(thumbTip, indexMCP) > 0.1; // Stricter thumb extension

  // 1. Pinch/Drag: Index Tip and Thumb Tip are very close
  // Check that the pinch is intentional (index and thumb tips close, index not fully extended away from thumb)
  const pinchDist = getDistance(indexTip, thumbTip);
  if (pinchDist < 0.03) {
    return GestureState.PINCH;
  }

  // 2. Screenshot/Frame: Index AND Thumb extended, others curled
  // We use a slightly stricter check here to avoid false positives with marker
  if (indexExtended && thumbExtended && !middleExtended && !ringExtended) {
    return GestureState.SCREENSHOT;
  }

  // 3. Eraser: All 4 main fingers extended (Open Palm)
  if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
    return GestureState.ERASER;
  }

  // 4. Marker: Index extended, but ensure others are mostly curled to distinguish from palm/eraser
  // Relaxed: only check middle and ring to be curled
  if (indexExtended && !middleExtended && !ringExtended) {
    return GestureState.MARKER;
  }

  return GestureState.IDLE;
};
