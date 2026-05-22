export const IST_TIME_ZONE = 'Asia/Kolkata'

const BRIEF_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIME_ZONE,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const EVENT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

function toDate(value = Date.now()) {
  if (value instanceof Date) return value
  return new Date(value)
}

function parseIstAllDay(value = '') {
  return new Date(`${value}T00:00:00+05:30`)
}

export function formatIstBriefLabel(value = Date.now()) {
  return `${BRIEF_DATE_FORMATTER.format(toDate(value))} IST`
}

export function formatIstEventWhen(value = '') {
  if (!value) return 'Time pending'
  const date = parseIstAllDay(value)
  if (Number.isNaN(date.getTime())) return `${value} - all day`
  return `${EVENT_DATE_FORMATTER.format(date)} - all day`
}

export function formatIstEventDateTime(value = '') {
  if (!value) return 'Time pending'
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${EVENT_DATE_TIME_FORMATTER.format(date)} IST`
}

export function formatIstTime(value = Date.now()) {
  return `${TIME_FORMATTER.format(toDate(value))} IST`
}
