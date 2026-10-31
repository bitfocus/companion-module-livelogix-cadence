// A stand-in for the Companion instance: the module's REAL helper methods
// (choices, sendCommand, …) on top of recorders for the Companion API calls.
// Lets tests build definitions and invoke action callbacks with no Companion.
const { methods, normalizeSnapshot } = require('../src/helpers')
const { definitionMethods } = require('../src/definitions')

function makeFakeSelf(snapshot, { port } = {}) {
	const self = {
		label: 'cadence',
		connected: true,
		config: { host: '127.0.0.1', port: port || 8730, poll: 250 },
		state: normalizeSnapshot(snapshot),
		logs: [],
		_actions: null,
		_feedbacks: null,
		_presets: null,
		_varDefs: null,
		_varValues: {},
		setActionDefinitions(d) {
			this._actions = d
		},
		setFeedbackDefinitions(d) {
			this._feedbacks = d
		},
		setPresetDefinitions(d) {
			this._presets = d
		},
		setVariableDefinitions(d) {
			this._varDefs = d
		},
		setVariableValues(v) {
			Object.assign(this._varValues, v)
		},
		// Minimal $(label:var) substitution against our own variable values.
		async parseVariablesInString(s) {
			return String(s).replace(/\$\(([^:)]+):([^)]+)\)/g, (m, label, id) =>
				label === this.label && id in this._varValues ? String(this._varValues[id]) : m,
			)
		},
		log(level, msg) {
			this.logs.push({ level, msg })
		},
		statuses: [],
		checkFeedbacks() {},
		updateStatus(status, message) {
			this.statuses.push(message ? `${status}:${message}` : status)
		},
		poll() {},
	}
	Object.assign(self, methods, definitionMethods)
	return self
}

// Run an action's callback the way Companion does: options filled from defaults
// then overridden by `options`.
async function runAction(self, actionId, options = {}) {
	const def = self._actions[actionId]
	if (!def) throw new Error(`no action "${actionId}"`)
	const opts = {}
	for (const o of def.options || []) if ('default' in o) opts[o.id] = o.default
	Object.assign(opts, options)
	// Like Companion: variables in useVariables fields are filled in before the
	// callback runs (the module itself never expands them again).
	for (const o of def.options || [])
		if (o.useVariables && typeof opts[o.id] === 'string') opts[o.id] = await self.parseVariablesInString(opts[o.id])
	await def.callback({ actionId, options: opts })
}

function runFeedback(self, feedbackId, options = {}) {
	const def = self._feedbacks[feedbackId]
	if (!def) throw new Error(`no feedback "${feedbackId}"`)
	const opts = {}
	for (const o of def.options || []) if ('default' in o) opts[o.id] = o.default
	Object.assign(opts, options)
	return def.callback({ feedbackId, options: opts })
}

module.exports = { makeFakeSelf, runAction, runFeedback }
