// Whole-show vs Producer-page scope: endpoint selection, failure messages an
// operator can act on, the upgrade script, outputs (read-only), and renames
// refreshing definitions.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { startMockCadence } = require('./mock-cadence')
const { makeFakeSelf, runAction, runFeedback } = require('./fake-self')
const { endpoints, describeFailure, Status } = require('../src/helpers')
const { addScopeKeepingPageBehaviour } = require('../src/upgrades')
const FIXTURE = require('./fixture-snapshot.json')

test('endpoints follow the scope (whole show is the default)', () => {
	assert.deepEqual(endpoints({}), { state: '/api/show/state', command: '/api/show/command' })
	assert.deepEqual(endpoints({ scope: 'show' }), { state: '/api/show/state', command: '/api/show/command' })
	assert.deepEqual(endpoints({ scope: 'page' }), { state: '/api/state', command: '/api/command' })
})

test('commands go to the scope’s command route', async () => {
	const mock = await startMockCadence(FIXTURE)
	try {
		for (const scope of ['show', 'page']) {
			const self = makeFakeSelf({}, { port: mock.port })
			self.config.scope = scope
			self.pollSucceeded(FIXTURE)
			await runAction(self, 'timer_transport', { pick: 'timer-A', action: 'start' })
		}
		assert.deepEqual(mock.paths, ['/api/show/command', '/api/command'])
	} finally {
		await mock.close()
	}
})

test('old Cadence (no whole-show route) → actionable bad-config status', () => {
	const show = describeFailure({ scope: 'show' }, { httpStatus: 404 })
	assert.equal(show.status, Status.BadConfig)
	assert.match(show.message, /One Producer page/)
	// on a page, a 404 is just a failure (wrong port etc.)
	assert.equal(describeFailure({ scope: 'page' }, { httpStatus: 404 }).status, Status.ConnectionFailure)
})

test('Cadence refusing whole-show control surfaces its own message', () => {
	const self = makeFakeSelf({})
	self.resetConnection()
	const msg = 'Whole-show control is off for this show (File ▸ Allow Whole-Show Remote Control).'
	self.handleStateReply({ ok: false, error: msg })
	self.handleStateReply({ ok: false, error: msg }) // reported once
	assert.deepEqual(self.statuses, ['connecting', `bad_config:${msg}`])
	self.handleStateReply(FIXTURE) // switched back on
	assert.deepEqual(self.statuses.at(-1), 'ok')
})

test('upgrade: pre-scope connections keep Producer-page behaviour', () => {
	const old = addScopeKeepingPageBehaviour({}, { config: { host: '10.0.0.5', port: 8741 } })
	assert.deepEqual(old.updatedConfig, { host: '10.0.0.5', port: 8741, scope: 'page' })
	const fresh = addScopeKeepingPageBehaviour({}, { config: { host: 'x', port: 8730, scope: 'show' } })
	assert.equal(fresh.updatedConfig, null)
})

test('outputs: read-only variables, feedbacks, status presets — and no output actions', () => {
	const self = makeFakeSelf({})
	self.pollSucceeded(FIXTURE)
	const v = self._varValues
	assert.equal(v.output_out_1_enabled, 'yes')
	assert.equal(v.output_out_1_source, 'Keynote Look')
	assert.equal(v.output_out_2_enabled, 'no')
	assert.equal(v.output_out_2_kind, 'display')
	assert.equal(runFeedback(self, 'output_enabled', { output: 'out-1' }), true)
	assert.equal(runFeedback(self, 'output_enabled', { output: 'out-2' }), false)
	assert.equal(runFeedback(self, 'output_shows', { output: 'out-1', source: 'keynote look' }), true)
	assert.ok('output_out_1' in self._presets)
	assert.deepEqual(
		Object.keys(self._actions).filter((a) => a.startsWith('output')),
		[],
	)
})

test('renaming an element in Cadence refreshes dropdown labels', () => {
	const self = makeFakeSelf({})
	self.pollSucceeded(FIXTURE)
	const label = () => self._actions.timer_transport.options[0].choices.find((c) => c.id === 'timer-A').label
	assert.equal(label(), 'Keynote')
	const renamed = structuredClone(FIXTURE)
	renamed.clocks[0].name = 'Opening Keynote'
	self.pollSucceeded(renamed)
	assert.equal(label(), 'Opening Keynote')
})
