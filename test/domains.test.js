// Offline wire tests for every non-timer domain: each action's exact POST body,
// the derived feedbacks, and the per-entity variables.
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { startMockCadence } = require('./mock-cadence')
const { makeFakeSelf, runAction, runFeedback } = require('./fake-self')
const { setActions } = require('../src/actions')
const { setFeedbacks } = require('../src/feedbacks')
const { setPresets } = require('../src/presets')
const { initVariables, updateVariables } = require('../src/variables')
const { parseTimeOfDay, parseDuration } = require('../src/helpers')
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
let mark = 0
beforeEach(() => (mark = mock.commands.length))
const sent = () => mock.commands.slice(mark)

test('parsers', () => {
	assert.equal(parseTimeOfDay('14:30'), 52200)
	assert.equal(parseTimeOfDay('2:30 PM'), 52200)
	assert.equal(parseTimeOfDay('2:30:15pm'), 52215)
	assert.equal(parseTimeOfDay('12:00 AM'), 0)
	assert.equal(parseTimeOfDay('12:05 pm'), 43500)
	assert.equal(parseTimeOfDay('9am'), 32400)
	assert.equal(parseTimeOfDay('25:00'), null)
	assert.equal(parseTimeOfDay('13:00 PM'), null)
	assert.equal(parseTimeOfDay('noon'), null)
	assert.equal(parseDuration('1:30'), 90)
	assert.equal(parseDuration('1:2:3:4'), null)
	// A duration can't be negative, typed either way (the review's L5).
	assert.equal(parseDuration('-5'), null)
	assert.equal(parseDuration('-5:00'), null)
	assert.equal(parseDuration('300'), 300)
})

test('timer: set remaining / end at / till / slot / undo', async () => {
	await runAction(self, 'timer_set_remaining', { pick: 'timer-A', value: '4:30' })
	await runAction(self, 'timer_end_at', { pick: 'timer-A', time: '2:30 PM' })
	await runAction(self, 'timer_end_at', { pick: 'till-1', time: '16:15' })
	await runAction(self, 'timer_edit_slot', { pick: 'timer-A', slot: '2', thenStart: true })
	await runAction(self, 'timer_edit_slot', { pick: 'timer-A', slot: '1' }) // empty slot → nothing
	await runAction(self, 'timer_undo', { pick: 'timer-A' })
	assert.deepEqual(sent(), [
		{ action: 'setTime', clock: 'timer-A', seconds: 270 },
		{ action: 'setEndTime', clock: 'timer-A', seconds: 52200 },
		{ action: 'setTill', clock: 'till-1', seconds: 58500 },
		{ action: 'setDuration', clock: 'timer-A', seconds: 900 },
		{ action: 'start', clock: 'timer-A' },
		{ action: 'undo', clock: 'timer-A' },
	])
	assert.ok(self.logs.some((l) => l.msg.includes('slot 2')))
})

test('time shift + ProPresenter', async () => {
	await runAction(self, 'shift_rate', { shift: 'shift-1', value: '1.1' })
	await runAction(self, 'shift_rate', { shift: 'shift-1', value: '0' }) // rejected client-side
	await runAction(self, 'propresenter_timer', { clock: 'pp-1', action: 'ppReset' })
	assert.deepEqual(sent(), [
		{ action: 'shiftRate', id: 'shift-1', value: 1.1 },
		{ action: 'ppReset', clock: 'pp-1' },
	])
	assert.deepEqual(
		self._actions.propresenter_timer.options[0].choices.map((c) => c.id),
		['pp-1'],
	)
})

test('preset: flat picker selects then applies, legacy shape still works', async () => {
	const P = '22222222-2222-2222-2222-222222222222'
	await runAction(self, 'preset_apply', { preset: `bank-1::${P}`, mode: 'setStart' })
	await runAction(self, 'preset_apply', { bank: 'bank-1', preset: P, mode: 'set' })
	await runAction(self, 'preset_apply', { preset: `bank-1::${P}`, mode: 'select' })
	assert.deepEqual(sent(), [
		{ action: 'presetSelect', bank: 'bank-1', preset: P },
		{ action: 'presetSetStart', bank: 'bank-1' },
		{ action: 'presetSelect', bank: 'bank-1', preset: P },
		{ action: 'presetSet', bank: 'bank-1' },
		{ action: 'presetSelect', bank: 'bank-1', preset: P },
	])
	assert.equal(runFeedback(self, 'preset_selected', { preset: 'bank-1::11111111-1111-1111-1111-111111111111' }), true)
	assert.equal(runFeedback(self, 'preset_selected', { preset: `bank-1::${P}` }), false)
})

test('schedule: every control action + jumps', async () => {
	const choices = self._actions.schedule_control.options[1].choices.map((c) => c.id)
	for (const action of choices) await runAction(self, 'schedule_control', { schedule: 'sched-1', action })
	await runAction(self, 'schedule_jump', { schedule: 'sched-1', by: 'cue', target: '12' })
	await runAction(self, 'schedule_jump', { schedule: 'sched-1', by: 'row', target: '3' })
	await runAction(self, 'schedule_jump', { schedule: 'sched-1', by: 'row', target: '0' }) // invalid
	const got = sent()
	assert.deepEqual(
		got.slice(0, choices.length),
		choices.map((action) => ({ action, schedule: 'sched-1' })),
	)
	assert.deepEqual(got.slice(choices.length), [
		{ action: 'schedJumpCue', schedule: 'sched-1', cue: '12' },
		{ action: 'schedJump', schedule: 'sched-1', index: 2 },
	])
})

test('scheduler toggle reads armed state', async () => {
	await runAction(self, 'scheduler_control', { scheduler: 'schr-1', action: 'toggle' })
	await runAction(self, 'scheduler_control', { scheduler: 'schr-1', action: 'schFireNext' })
	assert.deepEqual(sent(), [
		{ action: 'schArm', scheduler: 'schr-1' },
		{ action: 'schFireNext', scheduler: 'schr-1' },
	])
})

test('scene recall + undo targets the pending scene', async () => {
	await runAction(self, 'scene_recall', { scene: 'scene-1' })
	await runAction(self, 'scene_undo', {})
	assert.deepEqual(sent(), [
		{ action: 'recallScene', scene: 'scene-1' },
		{ action: 'undoRecall', scene: 'scene-1' },
	])
	assert.equal(runFeedback(self, 'scene_undo_available', { scene: '' }), true)
	assert.equal(runFeedback(self, 'scene_undo_available', { scene: 'other' }), false)
})

test('message: toggle, text + show', async () => {
	await runAction(self, 'message_visibility', { message: 'msg-1', vis: 'toggle' })
	await runAction(self, 'message_text', { message: 'msg-1', text: 'Ends at $(cadence:timer_1_endtime)', show: true })
	assert.deepEqual(sent(), [
		{ action: 'msgVis', message: 'msg-1', vis: 'shown' },
		{ action: 'msgText', message: 'msg-1', text: 'Ends at 4:06 PM' },
		{ action: 'msgVis', message: 'msg-1', vis: 'shown' },
	])
	assert.equal(runFeedback(self, 'message_vis', { message: 'msg-1', vis: 'hidden' }), true)
	assert.equal(runFeedback(self, 'message_vis', { message: 'msg-1', vis: 'onair' }), false)
})

test('automation: toggle + set time', async () => {
	await runAction(self, 'automation_arm', { automation: 'auto-1', armed: 'toggle' })
	await runAction(self, 'automation_time', { automation: 'auto-1', time: '5:45:30 PM' })
	assert.deepEqual(sent(), [
		{ action: 'autoArm', automation: 'auto-1', armed: false },
		{ action: 'autoTime', automation: 'auto-1', hour: 17, minute: 45, second: 30 },
	])
	assert.equal(runFeedback(self, 'automation_imminent', { automation: 'auto-1' }), true)
})

test('cue stack: go / add', async () => {
	await runAction(self, 'cuestack_control', { clock: 'timer-A', action: 'stackGo' })
	await runAction(self, 'cuestack_add', { clock: 'timer-A', value: '2:00', label: ' Wrap ' })
	await runAction(self, 'cuestack_add', { clock: 'timer-A', value: '90', label: '' })
	assert.deepEqual(sent(), [
		{ action: 'stackGo', clock: 'timer-A' },
		{ action: 'stackAdd', clock: 'timer-A', seconds: 120, label: 'Wrap' },
		{ action: 'stackAdd', clock: 'timer-A', seconds: 90 },
	])
	assert.equal(runFeedback(self, 'cuestack_has_cues', { clock: 'timer-A' }), true)
})

test('poll: toggles read live state; go is 1-based in UI, 0-based on wire', async () => {
	await runAction(self, 'poll_control', { poll: 'poll-1', action: 'toggleOpen' })
	await runAction(self, 'poll_control', { poll: 'poll-1', action: 'toggleReveal' })
	await runAction(self, 'poll_control', { poll: 'poll-1', action: 'hide' })
	await runAction(self, 'poll_control', { poll: 'poll-1', action: 'pollNext' })
	await runAction(self, 'poll_go', { poll: 'poll-1', number: '3' })
	await runAction(self, 'poll_results_mode', { poll: 'poll-1', mode: 'live' })
	assert.deepEqual(sent(), [
		{ action: 'pollClose', poll: 'poll-1' },
		{ action: 'pollReveal', poll: 'poll-1', on: true },
		{ action: 'pollReveal', poll: 'poll-1', on: false },
		{ action: 'pollNext', poll: 'poll-1' },
		{ action: 'pollGo', poll: 'poll-1', index: 2 },
		{ action: 'pollResults', poll: 'poll-1', mode: 'live' },
	])
	assert.equal(runFeedback(self, 'poll_state', { poll: 'poll-1', state: 'open' }), true)
})

test('schedule drift feedback', () => {
	assert.equal(runFeedback(self, 'schedule_drift', { schedule: 'sched-1', dir: 'behind', seconds: 60 }), true)
	assert.equal(runFeedback(self, 'schedule_drift', { schedule: 'sched-1', dir: 'behind', seconds: 600 }), false)
	assert.equal(runFeedback(self, 'schedule_drift', { schedule: 'sched-1', dir: 'ahead', seconds: 0 }), false)
	assert.equal(runFeedback(self, 'shift_active', { shift: 'shift-1' }), true)
})

test('entity variables', () => {
	const v = self._varValues
	assert.equal(v.page_title, 'Stage Manager')
	assert.equal(v.scene_undo, 'Keynote Look')
	assert.equal(v.scene_undo_remaining, 43)
	assert.equal(v.schedule_sched_1_ondeck, 'Cue 4 · Keynote')
	assert.equal(v.schedule_sched_1_drift, '+5:00')
	assert.equal(v.schedule_sched_1_running_cue, 'Cue 3 · Welcome')
	assert.equal(v.scheduler_schr_1_armed, 'no')
	assert.equal(v.automation_auto_1_countdown, 13)
	assert.equal(v.message_msg_1_text, 'Please wrap up')
	assert.equal(v.shift_shift_1_rate, 0.9)
	assert.equal(v.cuestack_timer_a_count, 2)
	assert.equal(v.cuestack_timer_a_next, 'Q&A (5:00)')
	assert.equal(v.poll_poll_1_leader, 'Tacos')
	assert.equal(v.poll_poll_1_leader_percent, 54)
	assert.equal(v.poll_poll_1_position, '2 / 5')
	assert.equal(v.timer_1_undo, 32)
	assert.equal(v.timer_2_rate, 0.9)
	// every declared variable got a value
	const missing = self._varDefs.filter((d) => !(d.variableId in v)).map((d) => d.variableId)
	assert.deepEqual(missing, [])
})

test('offline blanks live times but keeps labels', () => {
	self.connected = false
	updateVariables(self)
	const v = self._varValues
	assert.equal(v.timer_1_time, '--:--')
	assert.equal(v.timer_1_remaining, '')
	assert.equal(v.timer_1_running, 'no')
	assert.equal(v.timer_1_name, 'Keynote')
	assert.equal(v.schedule_sched_1_running_cue, 'Cue 3 · Welcome')
	self.connected = true
	updateVariables(self)
})

test('presets reference only real actions, feedbacks and variables', () => {
	const varIds = new Set(self._varDefs.map((d) => d.variableId))
	const names = Object.keys(self._presets)
	assert.ok(names.length > 30, `built ${names.length} presets`)
	for (const [id, p] of Object.entries(self._presets)) {
		if (p.type === 'text') continue // a note in the Presets panel: no actions, feedbacks or style
		for (const step of p.steps)
			for (const a of step.down) assert.ok(a.actionId in self._actions, `${id}: action ${a.actionId}`)
		for (const f of p.feedbacks) assert.ok(f.feedbackId in self._feedbacks, `${id}: feedback ${f.feedbackId}`)
		for (const [, vid] of p.style.text.matchAll(/\$\(cadence:([^)]+)\)/g))
			assert.ok(varIds.has(vid), `${id}: variable ${vid}`)
	}
})

test('every action / feedback definition is well-formed', () => {
	for (const [id, a] of Object.entries(self._actions)) {
		assert.equal(typeof a.name, 'string', id)
		assert.equal(typeof a.callback, 'function', id)
		for (const o of a.options) assert.ok(o.id && o.type, `${id}.${o.id}`)
		for (const o of a.options.filter((o) => o.type === 'dropdown'))
			assert.ok(o.allowCustom || o.choices.some((c) => c.id === o.default), `${id}.${o.id} default is a choice`)
	}
	for (const [id, f] of Object.entries(self._feedbacks)) {
		assert.ok(['boolean', 'advanced'].includes(f.type), id)
		for (const o of f.options.filter((o) => o.type === 'dropdown'))
			assert.ok(o.allowCustom || o.choices.some((c) => c.id === o.default), `${id}.${o.id} default is a choice`)
	}
})
