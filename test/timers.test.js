// Offline tests: the module's real action callbacks POST to a mock Cadence and
// we assert the exact wire bodies; feedbacks/variables read a fixture snapshot.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { startMockCadence } = require('./mock-cadence')
const { makeFakeSelf, runAction, runFeedback } = require('./fake-self')
const { setActions } = require('../src/actions')
const { setFeedbacks } = require('../src/feedbacks')
const { setPresets } = require('../src/presets')
const { initVariables, updateVariables } = require('../src/variables')
const FIXTURE = require('./fixture-snapshot.json')

let mock, self
before(async () => {
	mock = await startMockCadence(FIXTURE)
	self = makeFakeSelf(FIXTURE, { port: mock.port })
	initVariables(self)
	setActions(self)
	setFeedbacks(self)
	setPresets(self)
	updateVariables(self)
})
after(() => mock.close())

const last = () => mock.commands[mock.commands.length - 1]

test('timer transport sends {action, clock}', async () => {
	for (const action of ['start', 'pause', 'toggle', 'reset']) {
		await runAction(self, 'timer_transport', { pick: 'timer-A', action })
		assert.deepEqual(last(), { action, clock: 'timer-A' })
	}
})

test('override ID wins over the dropdown and resolves variables', async () => {
	await runAction(self, 'timer_transport', { pick: 'timer-A', overrideId: '$(cadence:timer_2_name)', action: 'start' })
	// timer_2_name resolves to the second countdown's name → used verbatim as the id
	assert.equal(last().clock, self._varValues['timer_2_name'])
})

test('adjust and set-duration parse their inputs', async () => {
	await runAction(self, 'timer_adjust', { pick: 'timer-A', seconds: '-30' })
	assert.deepEqual(last(), { action: 'adjust', clock: 'timer-A', seconds: -30 })

	const before = mock.commands.length
	await runAction(self, 'timer_set_duration', { pick: 'timer-A', value: '1:02:03', thenStart: true })
	assert.deepEqual(mock.commands.slice(before), [
		{ action: 'setDuration', clock: 'timer-A', seconds: 3723 },
		{ action: 'start', clock: 'timer-A' },
	])
})

test('bad input sends nothing', async () => {
	const before = mock.commands.length
	await runAction(self, 'timer_adjust', { pick: 'timer-A', seconds: 'abc' })
	await runAction(self, 'timer_set_duration', { pick: 'timer-A', value: '' })
	await runAction(self, 'timer_transport', { pick: '', action: 'start' })
	assert.equal(mock.commands.length, before)
})

test('schedule action defaults to a valid wire action', async () => {
	const def = self._actions.schedule_control
	const action = def.options.find((o) => o.id === 'action')
	assert.ok(
		action.choices.some((c) => c.id === action.default),
		`default "${action.default}" is one of the choices`,
	)
})

test('timer dropdowns list only countdowns', () => {
	const ids = self._actions.timer_transport.options[0].choices.map((c) => c.id)
	assert.deepEqual(ids, ['timer-A', 'timer-B', 'till-1'])
})

test('mood feedback matches normal/warning/danger/expired', () => {
	assert.equal(runFeedback(self, 'timer_mood', { clock: 'timer-A', mood: 'danger' }), true)
	assert.equal(runFeedback(self, 'timer_mood', { clock: 'timer-A', mood: 'warning' }), false)
	assert.equal(runFeedback(self, 'timer_running', { clock: 'timer-A' }), true)
	assert.equal(runFeedback(self, 'timer_running', { clock: 'timer-B' }), false)
	assert.equal(runFeedback(self, 'timer_under', { clock: 'timer-A', seconds: 30 }), true)
})

test('cue light feedback paints its live colour', () => {
	const style = runFeedback(self, 'cuelight_color', { cue: 'cue-1' })
	assert.equal(style.bgcolor, (0xff << 16) | (0x59 << 8) | 0x4f)
})

test('variables: timer by index and clock by id', () => {
	const v = self._varValues
	assert.equal(v.timer_count, 3)
	assert.equal(v.timer_1_time, '0:12')
	assert.equal(v.timer_1_remaining, 12)
	assert.equal(v.timer_1_mood, 'danger')
	assert.equal(v.timer_1_running, 'yes')
	assert.equal(v.clock_tod_1_time, '4:05 PM')
})

test('clock colour feedback mirrors on-screen colour with contrast text', () => {
	const red = runFeedback(self, 'clock_color', { clock: 'timer-A' })
	assert.equal(red.bgcolor, (0xff << 16) | (0x59 << 8) | 0x4f)
	assert.equal(red.color, 0xffffff) // white text on red
	const white = runFeedback(self, 'clock_color', { clock: 'timer-B' })
	assert.equal(white.color, 0) // black text on white
	assert.deepEqual(runFeedback(self, 'clock_color', { clock: 'tod-1' }), {}) // no colour → no override
})

test('extended timer variables', () => {
	const v = self._varValues
	assert.equal(v.timer_1_duration_hms, '10:00')
	assert.equal(v.timer_1_progress, 98)
	assert.equal(v.timer_1_rate, 1)
	assert.equal(v.timer_1_color, '#FF594F')
	assert.equal(v.clock_timer_a_color, '#FF594F')
})

test('offline clears to Offline state', () => {
	self.connected = false
	updateVariables(self)
	assert.equal(self._varValues.connection_state, 'Offline')
	assert.equal(runFeedback(self, 'offline'), true)
	self.connected = true
	updateVariables(self)
})

test('rejected command is logged, not thrown', async () => {
	const bad = makeFakeSelf(FIXTURE, { port: 1 }) // nothing listening
	const ack = await bad.sendCommand({ action: 'start', clock: 'x' })
	assert.equal(ack.ok, false)
	assert.ok(bad.logs.some((l) => l.level === 'error'))
})
