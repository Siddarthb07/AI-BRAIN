/** Request webcam in the same click/tap that enables gestures (required by browsers). */

export async function requestGestureCamera() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API unavailable — use Chrome/Edge on localhost or HTTPS')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    })
  } catch (first) {
    // Fallback: looser constraints (some laptops reject ideal size)
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    } catch {
      throw first
    }
  }
}

export function streamHasLiveVideo(stream) {
  return Boolean(stream?.getVideoTracks?.().some((t) => t.readyState === 'live' && t.enabled !== false))
}
