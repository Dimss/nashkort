import { users, sessions, transaction } from './db.js'
import { sweepMissed } from './scheduler.js'
import { clients } from './clients.js'

// A state transition the account cannot make right now; routes answer 409.
export class AccountStateError extends Error {
  constructor(message) {
    super(message)
    this.status = 409
  }
}

/**
 * The admin's actions. The state change and what must be atomic with it run in
 * one transaction, and only then does the WhatsApp client stop or start.
 * Every action refuses the caller's own account.
 */
export function createAccounts({ registry = clients } = {}) {
  // The account if it is in `from` state; null when it does not exist.
  function transitionable(id, callerId, from, verb) {
    if (id === callerId) throw new AccountStateError('You cannot change your own account.')
    const user = users.get(id)
    if (!user) return null
    if (user.state !== from) {
      const article = from === 'approved' ? 'an' : 'a'
      throw new AccountStateError(`Only ${article} ${from} account can be ${verb} (it is ${user.state}).`)
    }
    return user
  }

  // Disabled state and sessions gone in one transaction, then the client closed with its credentials kept.
  function pause(id) {
    const row = transaction(() => {
      users.setState(id, 'disabled')
      sessions.deleteForUser(id)
      return users.get(id)
    })
    registry.stop(id).catch(() => {})
    return row
  }

  return {
    list() {
      return users.list()
    },

    approve(id, callerId) {
      if (!transitionable(id, callerId, 'pending', 'approved')) return null
      users.setState(id, 'approved')
      return users.get(id)
    },

    reject(id, callerId) {
      if (!transitionable(id, callerId, 'pending', 'rejected')) return null
      return pause(id)
    },

    disable(id, callerId) {
      if (!transitionable(id, callerId, 'approved', 'disabled')) return null
      return pause(id)
    },

    // Approved state and the missed sweep in one transaction, then the client started.
    enable(id, callerId) {
      if (!transitionable(id, callerId, 'disabled', 'enabled')) return null
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
