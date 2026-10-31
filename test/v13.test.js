// 1.3: Cue Stack Cue / Presets modes, Planning Center LIVE controls, poll
// open-answer settings + report clear, selected answer show / hide — wire bodies, feedbacks and variables.
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { startMockCadence } = require('./mock-cadence')
const { makeFakeSelf, runAction, runFeedback } = require('./fake-self')
const { setActions } = require('../src/actions')
const { setFeedbacks } = require('../src/feedbacks')
const { setPresets } = require('../src/presets')
const { initVariables, updateVariables } = require('../src/variables')
const FIXTURE = require('./fixture-snapshot.json')

// The fixture plus a Presets-mode stack, a Planning Center schedule and an
// open-answer poll.
const SNAP = JSON.parse(JSON.stringify(FIXTURE))
SNAP.cueStacks.push({
	id: 'src-2',
	name: 'Walk-ins',
	clock: 'timer-B',
	running: false,
	limit: 5,
	mode: 'presets',
	selected: 'p2',
	cues: [
		{ id: 'p1', seconds: 60, label: 'Short' },
		{ id: 'p2', seconds: 300, label: 'Long' },
		{ id: 'p3', seconds: 600, label: null },
	],
})
// timer-B is a Stopwatch with three marks (newest first).
Object.assign(
	SNAP.clocks.find((c) => c.id === 'timer-B'),
	{
		stopwatch: true,
		marks: [
			{ n: 3, elapsed: 75.04, split: 1.2 },
			{ n: 2, elapsed: 73.84, split: 13.84 },
			{ n: 1, elapsed: 60, split: 60 },
		],
	},
)
SNAP.schedules.push({
	id: 'pco-1',
	name: 'Sunday 9am',
	pco: {
		serviceType: 'Sunday',
		live: true,
		current: 'Worship',
		remaining: -12,
		next: 'Message',
		canControl: false,
		canTakeControl: true,
		controller: 'Front of house',
		canBack: true,
		canNext: true,
	},
})
SNAP.polls.push({
	...SNAP.polls[0],
	id: 'poll-open',
	name: 'Q&A',
	kind: 'open',
	filter: false,
	perPhone: 0,
	featured: 'k1',
	featuredText: 'Inspiring',
})

let mock, self
before(async () => {
	mock = await startMockCadence(SNAP)
	self = makeFakeSelf(SNAP, { port: mock.port })
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

test('cue stack: mode set / toggle, restore', async () => {
	await runAction(self, 'cuestack_mode', { clock: 'timer-A', mode: 'toggle' })
	await runAction(self, 'cuestack_mode', { clock: 'timer-B', mode: 'toggle' })
	await runAction(self, 'cuestack_mode', { clock: 'timer-A', mode: 'presets' })
	await runAction(self, 'cuestack_control', { clock: 'timer-B', action: 'stackRestore' })
	assert.deepEqual(sent(), [
		{ action: 'stackMode', clock: 'timer-A', mode: 'presets' },
		{ action: 'stackMode', clock: 'timer-B', mode: 'queue' },
		{ action: 'stackMode', clock: 'timer-A', mode: 'presets' },
		{ action: 'stackRestore', clock: 'timer-B' },
	])
})

test('cue stack: select a preset by step / end / row (clamped, ids from the list)', async () => {
	for (const [which, number] of [
		['next', '1'],
		['prev', '1'],
		['first', '1'],
		['last', '1'],
		['number', '3'],
		['number', '9'], // out of range → nothing sent
	])
		await runAction(self, 'cuestack_select', { clock: 'timer-B', which, number })
	assert.deepEqual(sent(), [
		{ action: 'stackSelect', clock: 'timer-B', cue: 'p3' },
		{ action: 'stackSelect', clock: 'timer-B', cue: 'p1' },
		{ action: 'stackSelect', clock: 'timer-B', cue: 'p1' },
		{ action: 'stackSelect', clock: 'timer-B', cue: 'p3' },
		{ action: 'stackSelect', clock: 'timer-B', cue: 'p3' },
	])
})

test('cue stack: mode / selection feedbacks and variables', () => {
	assert.equal(runFeedback(self, 'cuestack_mode', { clock: 'timer-B', mode: 'presets' }), true)
	assert.equal(runFeedback(self, 'cuestack_mode', { clock: 'timer-A', mode: 'queue' }), true)
	assert.equal(runFeedback(self, 'cuestack_mode', { clock: 'timer-A', mode: 'presets' }), false)
	assert.equal(runFeedback(self, 'cuestack_selected', { clock: 'timer-B', row: 2 }), true)
	assert.equal(runFeedback(self, 'cuestack_selected', { clock: 'timer-B', row: 1 }), false)
	assert.equal(runFeedback(self, 'cuestack_selected', { clock: 'timer-A', row: 1 }), false)
	const v = self._varValues
	assert.equal(v.cuestack_timer_b_mode, 'Presets')
	assert.equal(v.cuestack_timer_b_next, 'Long (5:00)')
	assert.equal(v.cuestack_timer_b_selected_position, '2 / 3')
	assert.equal(v.cuestack_timer_a_mode, 'Cue')
	assert.equal(v.cuestack_timer_a_next, 'Q&A (5:00)')
	assert.equal(v.cuestack_timer_a_selected_position, '')
})

test('planning center LIVE: actions, feedback, variables, presets', async () => {
	assert.deepEqual(
		self.pcoScheduleChoices().map((c) => c.id),
		['pco-1'],
	)
	await runAction(self, 'schedule_pco', { schedule: 'pco-1', action: 'pcoNext' })
	await runAction(self, 'schedule_pco', { schedule: 'pco-1', action: 'pcoBack' })
	await runAction(self, 'schedule_pco', { schedule: 'pco-1', action: 'pcoTakeControl' })
	assert.deepEqual(sent(), [
		{ action: 'pcoNext', schedule: 'pco-1' },
		{ action: 'pcoBack', schedule: 'pco-1' },
		{ action: 'pcoTakeControl', schedule: 'pco-1' },
	])
	assert.equal(runFeedback(self, 'schedule_pco', { schedule: 'pco-1', when: 'live' }), true)
	assert.equal(runFeedback(self, 'schedule_pco', { schedule: 'pco-1', when: 'control' }), false)
	assert.equal(runFeedback(self, 'schedule_pco', { schedule: 'pco-1', when: 'canTake' }), true)
	assert.equal(runFeedback(self, 'schedule_pco', { schedule: 'sched-1', when: 'live' }), false)
	const v = self._varValues
	assert.equal(v.schedule_pco_1_pco_live, 'yes')
	assert.equal(v.schedule_pco_1_pco_current, 'Worship')
	assert.equal(v.schedule_pco_1_pco_remaining, '-0:12')
	assert.equal(v.schedule_pco_1_pco_controller, 'Front of house')
	assert.equal(v.schedule_sched_1_pco_live, '')
	assert.ok(self._presets.pco_pco_1_next && self._presets.pco_pco_1_take)
	assert.ok(!self._presets.pco_sched_1_next)
})

test('polls: report clear, open-answer filter / per phone', async () => {
	await runAction(self, 'poll_control', { poll: 'poll-1', action: 'pollReportClear' })
	await runAction(self, 'poll_open_answers', { poll: 'poll-open', what: 'filterToggle' })
	await runAction(self, 'poll_open_answers', { poll: 'poll-open', what: 'filterOff' })
	await runAction(self, 'poll_open_answers', { poll: 'poll-open', what: 'perPhone', n: 5 })
	await runAction(self, 'poll_open_answers', { poll: 'poll-open', what: 'perPhone', n: 99 })
	assert.deepEqual(sent(), [
		{ action: 'pollReportClear', poll: 'poll-1' },
		{ action: 'pollSetFilter', poll: 'poll-open', on: true },
		{ action: 'pollSetFilter', poll: 'poll-open', on: false },
		{ action: 'pollSetPerPhone', poll: 'poll-open', n: 5 },
	])
	const v = self._varValues
	assert.equal(v.poll_poll_open_kind, 'open')
	assert.equal(v.poll_poll_open_filter, 'off')
	assert.equal(v.poll_poll_open_per_phone, 0)
	assert.equal(v.poll_poll_1_filter, '')
})

test('polls: selected answer show / hide / toggle', async () => {
	await runAction(self, 'poll_featured', { poll: 'poll-open', what: 'top' })
	await runAction(self, 'poll_featured', { poll: 'poll-open', what: 'rank', rank: '3' })
	await runAction(self, 'poll_featured', { poll: 'poll-open', what: 'rank', rank: '0' })
	await runAction(self, 'poll_featured', { poll: 'poll-open', what: 'hide' })
	await runAction(self, 'poll_featured', { poll: 'poll-open', what: 'toggle' })
	await runAction(self, 'poll_featured', { poll: 'poll-1', what: 'toggle' })
	assert.deepEqual(sent(), [
		{ action: 'pollFeature', poll: 'poll-open', n: 1 },
		{ action: 'pollFeature', poll: 'poll-open', n: 3 },
		{ action: 'pollUnfeature', poll: 'poll-open' },
		{ action: 'pollUnfeature', poll: 'poll-open' },
		{ action: 'pollFeature', poll: 'poll-1', n: 1 },
	])
	assert.equal(runFeedback(self, 'poll_featured', { poll: 'poll-open' }), true)
	assert.equal(runFeedback(self, 'poll_featured', { poll: 'poll-1' }), false)
	assert.equal(self._varValues.poll_poll_open_featured, 'Inspiring')
	assert.equal(self._varValues.poll_poll_1_featured, '')
})

test('stopwatch: Mark action, choices, variables, preset', async () => {
	assert.deepEqual(
		self.stopwatchChoices().map((c) => c.id),
		['timer-B'],
	)
	await runAction(self, 'stopwatch_mark', { pick: 'timer-B', overrideId: '' })
	assert.deepEqual(sent(), [{ action: 'mark', clock: 'timer-B' }])
	const v = self._varValues
	assert.equal(v.stopwatch_timer_b_marks, 3)
	assert.equal(v.stopwatch_timer_b_last, '1:15.0')
	assert.equal(v.stopwatch_timer_b_last_split, '0:01.2')
	assert.equal(v.stopwatch_timer_b_mark_1, '3 · 1:15.0 (+0:01.2)')
	assert.equal(v.stopwatch_timer_b_mark_3, '1 · 1:00.0 (+1:00.0)')
	assert.equal(v.stopwatch_timer_b_mark_4, '')
	assert.ok(!('stopwatch_timer_a_last' in v), 'only stopwatches get the marks variables')
	assert.ok(Object.values(self._presets).some((p) => p.steps?.[0].down[0]?.actionId === 'stopwatch_mark'))
})
