// Definition (re)builders mixed onto the instance — kept apart from helpers.js
// because they pull in actions/feedbacks/presets/variables, which themselves
// require helpers.
const { setActions } = require('./actions')
const { setFeedbacks } = require('./feedbacks')
const { setPresets } = require('./presets')
const { initVariables, updateVariables } = require('./variables')

const definitionMethods = {
	rebuildDefinitions() {
		this._lastFeedbackKey = undefined // new definitions: check every feedback again
		initVariables(this)
		setActions(this)
		setFeedbacks(this)
		setPresets(this)
		updateVariables(this)
	},

	// Push live values (only the changed ones) and re-evaluate feedbacks — only
	// when the snapshot or the connection changed (a paused show changes nothing).
	refreshValues() {
		updateVariables(this)
		const { now, ...rest } = this.state
		const key = `${this.connected ? 1 : 0}:${JSON.stringify(rest)}`
		if (key === this._lastFeedbackKey) return
		this._lastFeedbackKey = key
		this.checkFeedbacks()
	},
}

module.exports = { definitionMethods }
