const { InstanceBase, InstanceStatus, runEntrypoint } = require('@companion-module/base')
const { UpgradeScripts } = require('./upgrades')
const { GetConfigFields } = require('./config')
const { EMPTY_STATE, normalizeSnapshot, methods, endpoints, describeFailure } = require('./helpers')
const { definitionMethods } = require('./definitions')

class CadenceInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		// Latest snapshot from the Cadence producer server; actions, feedbacks and
		// variables all read this one shared source (see helpers.js).
		this.state = normalizeSnapshot(EMPTY_STATE)
		this.connected = false
		this.lastShapeSig = ''
	}

	async init(config) {
		this.config = config
		this.resetConnection()
		this.rebuildDefinitions()
		this.startPolling()
	}

	async destroy() {
		// Stop everything: no more polls, and a request still in flight is cut off
		// and can't touch the connection's status or variables afterwards.
		this.destroyed = true
		this.stopPolling()
		this.inflight?.abort()
	}

	async configUpdated(config) {
		this.config = config
		this.stopPolling()
		// New host/port = a different producer page: forget the old connection so
		// the first good poll reports OK again.
		this.resetConnection()
		this.startPolling()
	}

	getConfigFields() {
		return GetConfigFields()
	}

	startPolling() {
		this.stopPolling()
		const interval = Math.max(100, Number(this.config.poll) || 250)
		this.poll() // immediate first pull
		this.pollTimer = setInterval(() => this.poll(), interval)
	}

	stopPolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = undefined
		}
	}

	async poll() {
		if (this.destroyed) return
		// Don't stack requests if Cadence is slow to answer — but remember that a
		// fresh pull was wanted (e.g. right after a command) and run it next.
		if (this.polling) {
			this.repoll = true
			return
		}
		this.polling = true
		this.repoll = false
		const target = `${this.baseURL()}${endpoints(this.config).state}`
		const current = () => !this.destroyed && target === `${this.baseURL()}${endpoints(this.config).state}`
		const ctrl = new AbortController()
		const to = setTimeout(() => ctrl.abort(), 4000)
		this.inflight = ctrl
		try {
			// 1. The request. Only a network failure or timeout means "no response".
			let res
			try {
				res = await fetch(target, { signal: ctrl.signal })
			} catch (e) {
				if (current())
					this.pollFailed(describeFailure(this.config, { network: e.name === 'AbortError' ? 'timeout' : e.message }))
				return
			}
			// Ignore a reply from a target the config has since moved away from.
			if (!current()) return
			if (!res.ok) return this.pollFailed(describeFailure(this.config, { httpStatus: res.status }))
			// 2. The reply must be Cadence's JSON — something else on that port isn't Cadence.
			let snap
			try {
				snap = await res.json()
			} catch (e) {
				if (current()) this.pollFailed(describeFailure(this.config, { notCadence: true }))
				return
			}
			if (!current()) return
			// 3. Our own handling of the reply: a failure here is a module bug, not the network.
			try {
				this.handleStateReply(snap)
			} catch (e) {
				this.log('error', `Couldn't read Cadence's reply: ${e.stack || e.message}`)
				this.updateStatus(InstanceStatus.UnknownError, `Couldn't read Cadence's reply (${e.message})`)
			}
		} finally {
			clearTimeout(to)
			if (this.inflight === ctrl) this.inflight = undefined
			this.polling = false
			if (this.repoll && !this.destroyed) this.poll()
		}
	}
}

Object.assign(CadenceInstance.prototype, methods, definitionMethods)

runEntrypoint(CadenceInstance, UpgradeScripts)
