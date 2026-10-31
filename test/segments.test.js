// Time segments: hours / minutes / seconds split from the DISPLAYED time, so
// per-segment buttons always match Cadence's screen.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { clockSegments } = require('../src/helpers')
const { segmentText } = require('../src/feedbacks')
const { makeFakeSelf, runFeedback } = require('./fake-self')
const FIXTURE = require('./fixture-snapshot.json')

const seg = (primary, kind = 'countdown') => clockSegments({ primary, kind })

test('timer formats', () => {
	assert.deepEqual(seg('05:00'), { hh: '00', mm: '05', ss: '00', ff: '', sign: '', ampm: '' })
	assert.deepEqual(seg('01:02:03'), { hh: '01', mm: '02', ss: '03', ff: '', sign: '', ampm: '' })
	assert.deepEqual(seg('0:12'), { hh: '00', mm: '00', ss: '12', ff: '', sign: '', ampm: '' })
	// overtime — Cadence uses U+2212; a plain hyphen works too
	assert.deepEqual(seg('−05:00'), { hh: '00', mm: '05', ss: '00', ff: '', sign: '-', ampm: '' })
	assert.equal(seg('-1:00:00').sign, '-')
})

test('time of day and timecode', () => {
	assert.deepEqual(seg('4:05 PM', 'timeOfDay'), { hh: '4', mm: '05', ss: '', ff: '', sign: '', ampm: 'PM' })
	assert.deepEqual(seg('16:05:30', 'timeOfDay'), { hh: '16', mm: '05', ss: '30', ff: '', sign: '', ampm: '' })
	assert.deepEqual(seg('01:02:03:04', 'timecode'), { hh: '01', mm: '02', ss: '03', ff: '04', sign: '', ampm: '' })
})

test('placeholders stay placeholders', () => {
	assert.deepEqual(seg('--:--'), { hh: '--', mm: '--', ss: '--', ff: '', sign: '', ampm: '' })
	assert.deepEqual(seg('--:--:--:--', 'timecode'), { hh: '--', mm: '--', ss: '--', ff: '--', sign: '', ampm: '' })
	assert.deepEqual(seg('NO LTC', 'timecode'), { hh: '', mm: '', ss: '', ff: '', sign: '', ampm: '' })
	assert.deepEqual(seg(undefined), { hh: '', mm: '', ss: '', ff: '', sign: '', ampm: '' })
})

test('segment text choices', () => {
	const c = { primary: '−01:02:03', kind: 'countdown' }
	assert.equal(segmentText(c, 'hh', false), '01')
	assert.equal(segmentText(c, 'hh', true), '-01')
	assert.equal(segmentText(c, 'mmss', false), '02:03')
	assert.equal(segmentText(c, 'hhmm', true), '-01:02')
	assert.equal(segmentText({ primary: '4:05 PM', kind: 'timeOfDay' }, 'ampm', true), 'PM')
})

test('variables + feedback + big-digit presets', () => {
	const self = makeFakeSelf({})
	self.pollSucceeded(FIXTURE)
	const v = self._varValues
	// timer_1 "Keynote" shows "0:12"
	assert.deepEqual([v.timer_1_hh, v.timer_1_mm, v.timer_1_ss, v.timer_1_sign], ['00', '00', '12', ''])
	assert.deepEqual([v.clock_tod_1_hh, v.clock_tod_1_mm, v.clock_tod_1_ampm], ['4', '05', 'PM'])
	assert.deepEqual(runFeedback(self, 'clock_segment', { clock: 'timer-A', segment: 'ss', prefix: 'SEC ' }), {
		text: 'SEC 12',
	})
	for (const s of ['hh', 'mm', 'ss']) assert.ok(`timer_1_big_${s}` in self._presets)

	// offline → digits blank to "--", never a frozen time
	self.pollFailed('timeout')
	assert.deepEqual([v.timer_1_hh, v.timer_1_mm, v.timer_1_ss], ['--', '--', '--'])
	assert.deepEqual(runFeedback(self, 'clock_segment', { clock: 'timer-A', segment: 'mm' }), { text: '--' })
})
