/** Request webcam in the same click/tap that enables gestures (required by browsers). */

export async function requestGestureCamera() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API unavailable — use Chrome/Edge on localhost or HTTPS')
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  })
}
