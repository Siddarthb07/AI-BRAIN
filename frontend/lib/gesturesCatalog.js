/**
 * MediaPipe Gesture Recognizer canned labels
 * Source: google-ai-edge/mediapipe (@mediapipe/tasks-vision)
 * https://github.com/google-ai-edge/mediapipe
 *
 * Official canned categories (model still outputs all of these):
 * ["None", "Closed_Fist", "Open_Palm", "Pointing_Up", "Thumb_Down", "Thumb_Up", "Victory", "ILoveYou"]
 * Victory / ILoveYou are ignored — controls use fists + palms instead.
 */

export const MEDIAPIPE_CANNED_GESTURES = [
  {
    id: 'Closed_Fist',
    label: 'Closed Fist',
    aliases: ['fist', 'rock'],
    action: 'rotate',
    hint: '1 fist + move → rotate graph',
  },
  {
    id: 'Open_Palm',
    label: 'Open Palm',
    aliases: ['palm', 'paper', 'five'],
    action: 'reset',
    hint: '1 palm hold ~0.5s → reset view',
  },
  {
    id: 'Pointing_Up',
    label: 'Pointing Up',
    aliases: ['point', 'pointing'],
    action: 'select',
    hint: 'Point + slide L/R + hold → select repo',
  },
  {
    id: 'Thumb_Up',
    label: 'Thumb Up',
    aliases: ['thumbs_up', 'like'],
    action: 'confirm',
    hint: 'Thumbs up → confirm / select aimed repo',
  },
  {
    id: 'Thumb_Down',
    label: 'Thumb Down',
    aliases: ['thumbs_down', 'dislike'],
    action: 'cancel',
    hint: 'Thumbs down → clear selection',
  },
]

/** Multi-hand / landmark controls (not single canned labels). */
export const CUSTOM_CONTROL_GESTURES = [
  {
    id: 'Two_Palms_Zoom',
    label: 'Two Palms Zoom',
    aliases: ['dual_palm_zoom'],
    action: 'dual_zoom',
    hint: '2 open palms pull apart → zoom (movie style)',
  },
  {
    id: 'Two_Fists_Spin',
    label: 'Two Fists Spin',
    aliases: ['dual_fist_spin'],
    action: 'spin',
    hint: '2 fists hold ~0.5s → toggle spin',
  },
  {
    id: 'Pinch_Grab',
    label: 'Pinch + Drag',
    aliases: ['pinch'],
    action: 'pinch_orbit',
    hint: 'Pinch fingers + drag → fine rotate',
  },
]

export const ALL_GESTURES = [...MEDIAPIPE_CANNED_GESTURES, ...CUSTOM_CONTROL_GESTURES]

export const GESTURE_MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task',
]

/** Map MediaPipe categoryName → internal planner gesture key. */
export function mapCannedToInternal(categoryName = '') {
  const key = String(categoryName || '').trim()
  switch (key) {
    case 'Closed_Fist':
      return 'fist'
    case 'Open_Palm':
      return 'palm'
    case 'Pointing_Up':
      return 'point'
    case 'Thumb_Up':
      return 'thumbs_up'
    case 'Thumb_Down':
      return 'thumbs_down'
    case 'Victory':
    case 'ILoveYou':
    case 'None':
    case '':
      return 'none'
    default:
      return 'none'
  }
}

export function gestureHelpLines() {
  return ALL_GESTURES.map((g) => `${g.label}: ${g.hint}`)
}
