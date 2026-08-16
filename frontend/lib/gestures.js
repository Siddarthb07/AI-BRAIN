/** Request webcam in the same click/tap that enables gestures (required by browsers). */

export async function requestGestureCamera() {
  if (typeof window === 'undefined') {
    throw new Error('Camera only works in the browser')
  }
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    throw new Error('Camera needs HTTPS or localhost — open http://127.0.0.1:5055')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API unavailable — use Chrome or Edge')
  }

  // List devices first so we surface "no camera" vs "permission denied" clearly
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cams = devices.filter((d) => d.kind === 'videoinput')
    if (cams.length === 0) {
      // enumerateDevices often hides labels until permission — still try getUserMedia
    }
  } catch {
    /* ignore */
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    })
  } catch (first) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    } catch (second) {
      const name = second?.name || first?.name || 'Error'
      const msg = second?.message || first?.message || String(second || first)
      if (name === 'NotFoundError' || /not found|no device/i.test(msg)) {
        throw new Error('No camera found — plug in a webcam or enable it in Windows privacy settings')
      }
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new Error('Camera permission denied — allow camera for localhost in the browser address bar')
      }
      if (name === 'NotReadableError' || /in use|busy/i.test(msg)) {
        throw new Error('Camera is busy — close Zoom/Teams/other apps using it, then retry')
      }
      throw first
    }
  }
}

export function streamHasLiveVideo(stream) {
  return Boolean(stream?.getVideoTracks?.().some((t) => t.readyState === 'live' && t.enabled !== false))
}
