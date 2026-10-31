// The Bitfocus review of v1.4.0 (2026-10-30): each fix, pinned down.
const test = require('node:test')
const assert = require('node:assert/strict')
const { makeFakeSelf, runAction } = require('./fake-self')
const { setActions } = require('../src/actions')
const { describeFailure, Status } = require('../src/helpers')
const { initVariables, updateVariables } = require('../src/variables')
const FIXTURE = require('./fixture-snapshot.json')

const clone = () => JSON.parse(JSON.stringify(FIXTURE))

// Record commands instead of sending them; `reply` decides each ack.
function recording(self, reply = () => ({ ok: true })) {
	self.sent = []
	self.sendCommand = async (body) => {
		self.sent.push(body)
		return reply(body)
	}
}

test('M2: linking a schedule to Planning Center rebuilds presets and dropdowns', () => {
	const self = makeFakeSelf(clone())
	const before = self.shapeSignature()
	const snap = clone()
	snap.schedules[0].pco = { live: false }
	self.state = require('../src/helpers').normalizeSnapshot(snap)
	assert.notEqual(self.shapeSignature(), before)
})

test("M2: an output's type (in its dropdown label) is part of the shape", () => {
	const self = makeFakeSelf(clone())
	const before = self.shapeSignature()
	const snap = clone()
	snap.outputs[0].kind = 'web'
	self.state = require('../src/helpers').normalizeSnapshot(snap)
	assert.notEqual(self.shapeSignature(), before)
})

test('M3: variables are filled in once (by Companion), never twice', async () => {
	const self = makeFakeSelf(clone())
	setActions(self)
	recording(self)
	// A variable whose VALUE is text that looks like a variable stays that text.
	self._varValues.note = 'Use $(cadence:other)'
	self._varValues.other = 'WRONG'
	await runAction(self, 'message_text', { message: 'msg-1', text: '$(cadence:note)' })
	assert.deepEqual(self.sent, [{ action: 'msgText', message: 'msg-1', text: 'Use $(cadence:other)' }])
})

test('L1: a refused text update is not put on air; a refused duration is not started', async () => {
	const self = makeFakeSelf(clone())
	setActions(self)
	recording(self, () => ({ ok: false, error: 'nope' }))
	await runAction(self, 'message_text', { message: 'msg-1', text: 'Doors close in 5 min', show: true })
	assert.deepEqual(
		self.sent.map((c) => c.action),
		['msgText'],
	)
	self.sent = []
	await runAction(self, 'timer_set_duration', { pick: 'timer-A', value: '5:00', thenStart: true })
	assert.deepEqual(
		self.sent.map((c) => c.action),
		['setDuration'],
	)
	// Accepted: both go.
	recording(self)
	await runAction(self, 'timer_set_duration', { pick: 'timer-A', value: '5:00', thenStart: true })
	assert.deepEqual(
		self.sent.map((c) => c.action),
		['setDuration', 'start'],
	)
})

test("L2: a reply that isn't Cadence's says so, instead of 'no response'", () => {
	const f = describeFailure({ host: '192.168.1.20', port: 8730 }, { notCadence: true })
	assert.equal(f.status, Status.BadConfig)
	assert.match(f.message, /isn't Cadence at 192\.168\.1\.20:8730/)
	assert.doesNotMatch(f.message, /No response/)
})

test('L4: only changed variable values are sent; unchanged polls re-check no feedbacks', () => {
	const self = makeFakeSelf(clone())
	let pushes = []
	self.setVariableValues = (v) => pushes.push(v)
	let checks = 0
	self.checkFeedbacks = () => checks++
	initVariables(self)
	self.refreshValues()
	assert.ok(Object.keys(pushes[0]).length > 50, 'the first push sends everything')
	assert.equal(checks, 1)
	pushes = []
	self.refreshValues() // nothing changed
	assert.deepEqual(pushes, [])
	assert.equal(checks, 1)
	// One timer's time changes: only its values go, and feedbacks are checked again.
	const snap = clone()
	snap.clocks[0].primary = '04:59'
	self.state = require('../src/helpers').normalizeSnapshot(snap)
	self.refreshValues()
	assert.equal(pushes.length, 1)
	assert.ok(
		Object.keys(pushes[0]).every((k) => k.includes('_time') || k.includes('time')),
		JSON.stringify(pushes[0]),
	)
	assert.equal(checks, 2)
})

test("N1: offline blanks live clock times but keeps fixed times like an automation's trigger", () => {
	const self = makeFakeSelf(clone())
	initVariables(self)
	self.connected = false
	updateVariables(self)
	assert.equal(self._varValues.automation_auto_1_time, '4:00:00 PM')
	assert.equal(self._varValues.timer_1_time, '--:--')
})

test('L6: conditional fields use isVisibleExpression, not the deprecated isVisible', () => {
	const self = makeFakeSelf(clone())
	setActions(self)
	for (const [id, a] of Object.entries(self._actions))
		for (const o of a.options || []) assert.equal(typeof o.isVisible, 'undefined', `${id}.${o.id}`)
})
