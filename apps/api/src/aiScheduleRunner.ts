import { prisma } from '@wac/db'

interface ScheduleSlot {
  days: number[]       // 0=Sun 1=Mon … 6=Sat
  startTime: string    // "HH:MM" 24h
  endTime: string      // "HH:MM" 24h
}

interface AISchedule {
  enabled: boolean
  timezone: string     // IANA e.g. "Africa/Lagos"
  slots: ScheduleSlot[]
}

function isInWindow(schedule: AISchedule): boolean {
  if (!schedule.enabled || !schedule.slots?.length) return false

  const now = new Date()
  const localStr = now.toLocaleString('en-US', { timeZone: schedule.timezone, hour12: false })
  const local = new Date(localStr)
  const day = local.getDay()
  const hhmm = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`

  return schedule.slots.some((slot) => {
    if (!slot.days.includes(day)) return false
    return hhmm >= slot.startTime && hhmm < slot.endTime
  })
}

let lastMode: 'active' | 'learn' | null = null

export function startAIScheduleRunner() {
  // Check every minute
  setInterval(checkSchedule, 60 * 1000)
  // Check once 10 seconds after startup
  setTimeout(checkSchedule, 10 * 1000)
}

async function checkSchedule() {
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  if (!session) return

  const schedule = session.aiSchedule as AISchedule | null
  if (!schedule?.enabled) return  // no schedule configured — don't touch anything

  const shouldBeActive = isInWindow(schedule)
  const targetMode = shouldBeActive ? 'active' : 'learn'

  if (targetMode === lastMode) return  // no change needed

  if (shouldBeActive) {
    // Switch to Active: AI responds
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: { aiEnabled: true, learnMode: false },
    })
    console.log('[SCHEDULE] Switched to ACTIVE mode — AI is now responding')
  } else {
    // Switch to Learn: AI silent, captures human replies as training
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: { aiEnabled: true, learnMode: true },
    })
    console.log('[SCHEDULE] Switched to LEARN mode — AI is observing and training')
  }

  lastMode = targetMode
}
