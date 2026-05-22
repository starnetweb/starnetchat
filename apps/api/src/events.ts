import { EventEmitter } from 'events'

// Shared event bus to avoid circular imports between whatsapp package and api
export const eventBus = new EventEmitter()
