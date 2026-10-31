// 1.4: the module points people at Cadence — an About line in the Presets panel,
// feature notes on poll and schedule presets, and a "where to get it" status
// when nothing answers. Every link is a real cadence.livelogix.app page.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { makeFakeSelf } = require('./fake-self')
const { setPresets } = require('../src/presets')
const { describeFailure, Status } = require('../src/helpers')
const { GetConfigFields } = require('../src/config')
const FIXTURE = require('./fixture-snapshot.json')

test('presets: About Cadence + feature notes, as text presets with real links', () => {
	const self = makeFakeSelf(FIXTURE)
	setPresets(self)
	const texts = Object.values(self._presets).filter((p) => p.type === 'text')
	const about = texts.find((p) => p.name === 'About Cadence')
	assert.ok(about && about.category === 'Status')
	assert.match(about.text, /https:\/\/cadence\.livelogix\.app/)
	if (FIXTURE.polls.length) assert.ok(texts.some((p) => /\/#polls$/.test(p.text)))
	if (FIXTURE.schedules.length) assert.ok(texts.some((p) => /\/#schedule$/.test(p.text)))
	// Text entries come first in their category (they're read before the buttons).
	const all = Object.values(self._presets)
	for (const t of texts) {
		const first = all.find((p) => p.category === t.category)
		assert.equal(first, t, `${t.category}: its note leads the category`)
	}
})

test('unreachable: says where it looked and where to get Cadence', () => {
	const f = describeFailure({ host: '10.0.0.9', port: 8730 }, { network: 'fetch failed' })
	assert.equal(f.status, Status.ConnectionFailure)
	assert.match(f.message, /10\.0\.0\.9:8730 \(fetch failed\)/)
	assert.match(f.message, /cadence\.livelogix\.app/)
	assert.equal(describeFailure({}, { httpStatus: 500 }).message, 'HTTP 500')
})

test('connection panel opens with what Cadence is', () => {
	const [first] = GetConfigFields()
	assert.equal(first.type, 'static-text')
	assert.match(first.value, /https:\/\/cadence\.livelogix\.app/)
})
