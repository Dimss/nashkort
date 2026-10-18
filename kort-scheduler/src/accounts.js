import { users, sessions, transaction } from './db.js'
import { sweepMissed } from './scheduler.js'
import { clients } from './clients.js'

// Thrown for a state transition the account cannot make right now; routes answer 409.
export class AccountStateError extends Error {
  constructor(message) {
    super(message)
    this.status = 409
  }
}

/**
 * The admin's four actions, each with the exact ordering the pause requires:
 * the state change and what must be atomic with it happen in one transaction,
 * and only then does the WhatsApp client stop or start. Every action refuses
 * the caller's own account.
 */
export function createAccounts({ registry = clients } = {}) {
  function load(id, callerId) {
    if (id === callerId) throw new AccountStateError('You cannot change your own account.')
    const user = users.get(id)
    if (!user) return null
    return user
  }

  return {
    list() {
      return users.list()
    },

    approve(id, callerId) {
      const user = load(id, callerId)
      if (!user) return null
      if (user.state !== 'pending') throw new AccountStateError(`Only a pending account can be approved (it is ${user.state}).`)
      users.setState(id, 'approved')
      return users.get(id)
    },

    reject(id, callerId) {
      const user = load(id, callerId)
      if (!user) return null
      if (user.state !== 'pending') throw new AccountStateError(`Only a pending account can be rejected (it is ${user.state}).`)
      return this.pause(id)
    },

    disable(id, callerId) {
      const user = load(id, callerId)
      if (!user) return null
      if (user.state !== 'approved') throw new AccountStateError(`Only an approved account can be disabled (it is ${user.state}).`)
      return this.pause(id)
    },

    // Disabled state, sessions gone, then the client closed with its credentials kept.
    pause(id) {
      const row = transaction(() => {
        users.setState(id, 'disabled')
        sessions.deleteForUser(id)
        return users.get(id)
      })
      registry.stop(id).catch?.(() => {})
      return row
    },

    // Approved state and the missed sweep in one transaction, then the client started.
    async enable(id, callerId) {
      const user = load(id, callerId)
      if (!user) return null
      if (user.state !== 'disabled') throw new AccountStateError(`Only a disabled account can be enabled (it is ${user.state}).`)
      const row = transaction(() => {
        users.setState(id, 'approved')
        sweepMissed(id)
        return users.get(id)
      })
      registry.ensure(id)
      return row
    },
  }
}

export const accounts = createAccounts()
