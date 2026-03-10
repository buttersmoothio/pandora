/** Format a UTC ISO string as a datetime-local value in the given timezone. */
export function utcToLocalInput(iso: string, timeZone: string): string {
  const date = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  // en-CA formats hour 00 as "24" at midnight — normalize
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

/** Convert a datetime-local value (in the given timezone) to a UTC ISO string. */
export function localInputToUtc(local: string, timeZone: string): string {
  const [datePart, timePart] = local.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute))

  const inTz = utcToLocalInput(asUtc.toISOString(), timeZone)
  const [tzDate, tzTime] = inTz.split('T')
  const [ty, tm, td] = tzDate.split('-').map(Number)
  const [th, tmin] = tzTime.split(':').map(Number)
  const tzAsUtc = new Date(Date.UTC(ty, tm - 1, td, th, tmin))

  const offsetMs = tzAsUtc.getTime() - asUtc.getTime()
  return new Date(asUtc.getTime() - offsetMs).toISOString()
}

/** Format a UTC ISO string for display in the given timezone. */
export function formatInTimezone(
  iso: string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(iso).toLocaleString(undefined, { timeZone, ...options })
}
