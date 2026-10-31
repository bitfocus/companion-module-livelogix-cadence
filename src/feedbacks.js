const { combineRgb } = require('@companion-module/base')
const { clockSegments } = require('./helpers')

// Which part of a clock's displayed time the "Clock segment" feedback renders.
const SEGMENTS = [
	['hh', 'Hours'],
	['mm', 'Minutes'],
	['ss', 'Seconds'],
	['ff', 'Frames (timecode)'],
	['hhmm', 'Hours:Minutes'],
	['mmss', 'Minutes:Seconds'],
	['ampm', 'AM/PM (time of day)'],
]

// The text for one segment choice (optionally with the overtime "-" in front).
function segmentText(clock, segment, withSign) {
	const s = clockSegments(clock)
	const text = {
		hh: s.hh,
		mm: s.mm,
		ss: s.ss,
		ff: s.ff,
		hhmm: s.hh && s.mm ? `${s.hh}:${s.mm}` : '',
		mmss: s.mm && s.ss ? `${s.mm}:${s.ss}` : '',
		ampm: s.ampm,
	}[segment]
	return withSign && s.sign && segment !== 'ampm' ? `${s.sign}${text}` : text
}

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

function hexToRgbNumber(hex) {
	const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
	if (!m) return null
	const n = parseInt(m[1], 16)
	return combineRgb((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff)
}

// Black text on light backgrounds, white on dark (relative luminance).
function contrastText(hex) {
	const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
	if (!m) return WHITE
	const n = parseInt(m[1], 16)
	const lin = (v) => {
		v /= 255
		return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
	}
	const L = 0.2126 * lin((n >> 16) & 0xff) + 0.7152 * lin((n >> 8) & 0xff) + 0.0722 * lin(n & 0xff)
	return L > 0.4 ? BLACK : WHITE
}

function picker(id, label, choices) {
	return { type: 'dropdown', id, label, default: choices[0]?.id ?? '', choices, allowCustom: true }
}

function select(id, label, def, pairs) {
	return { type: 'dropdown', id, label, default: def, choices: pairs.map(([cid, l]) => ({ id: cid, label: l })) }
}

// A boolean feedback with a default style.
function bool(name, description, bg, fg, options, callback) {
	return { type: 'boolean', name, description, defaultStyle: { bgcolor: bg, color: fg }, options, callback }
}

function setFeedbacks(self) {
	const f = {}
	const GREEN = combineRgb(0, 150, 60)
	const AMBER = combineRgb(210, 130, 0)
	const RED = combineRgb(200, 30, 30)
	const BLUE = combineRgb(20, 90, 200)

	// ---- Timers / clocks -----------------------------------------------------------
	f.timer_running = bool(
		'Timer is running',
		'True while the selected timer is counting.',
		GREEN,
		WHITE,
		[picker('clock', 'Timer', self.timerChoices())],
		(fb) => !!self.findClock(fb.options.clock)?.running,
	)

	f.timer_mood = bool(
		'Timer state is…',
		'True when the selected timer is in the chosen state.',
		RED,
		WHITE,
		[
			picker('clock', 'Timer', self.timerChoices()),
			select('mood', 'State', 'expired', [
				['normal', 'Normal'],
				['warning', 'Warning (near end)'],
				['danger', 'Danger (final seconds)'],
				['expired', 'Expired (time up / overtime)'],
			]),
		],
		(fb) => (self.findClock(fb.options.clock)?.mood || 'normal') === fb.options.mood,
	)

	f.timer_under = bool(
		'Timer remaining below threshold',
		'True when a timer has N seconds or less left.',
		AMBER,
		WHITE,
		[
			picker('clock', 'Timer', self.timerChoices()),
			{ type: 'number', id: 'seconds', label: 'Threshold (seconds)', default: 60, min: 0, max: 86400 },
		],
		(fb) => {
			const c = self.findClock(fb.options.clock)
			return c?.remaining != null && c.remaining <= Number(fb.options.seconds)
		},
	)

	f.timer_undo_available = bool(
		'Timer can be undone',
		'True while the timer’s last edit can still be taken back.',
		BLUE,
		WHITE,
		[picker('clock', 'Timer', self.timerChoices())],
		(fb) => (self.findClock(fb.options.clock)?.undo ?? 0) > 0,
	)

	// Paint the key exactly the colour the clock is showing on screen right now
	// (the same resolved colour Cadence renders to display / NDI / SDI / web), so
	// a Stream Deck mirrors green → amber → red without re-entering thresholds.
	f.clock_color = {
		type: 'advanced',
		name: 'Clock colour (mirror on-screen colour)',
		description: 'Sets the button background to the clock’s current on-screen colour.',
		options: [
			picker('clock', 'Clock', self.clockChoices()),
			{ type: 'checkbox', id: 'autoText', label: 'Pick black/white text for contrast', default: true },
		],
		callback: (fb) => {
			const c = self.findClock(fb.options.clock)
			const bg = c ? hexToRgbNumber(c.colorHex) : null
			if (bg == null) return {}
			const style = { bgcolor: bg }
			if (fb.options.autoText) style.color = contrastText(c.colorHex)
			return style
		},
	}

	// Render ONE segment of a clock's time as the button text — hours on one key,
	// minutes on the next, seconds on a third — always matching the screen.
	f.clock_segment = {
		type: 'advanced',
		name: 'Clock segment (as button text)',
		description:
			'Shows just the hours, minutes or seconds (etc.) of a clock as the button’s text — put each on its own button for big, readable digits.',
		options: [
			picker('clock', 'Clock', self.clockChoices()),
			select('segment', 'Segment', 'mm', SEGMENTS),
			{ type: 'checkbox', id: 'withSign', label: 'Prefix "-" in overtime', default: false },
			{ type: 'textinput', id: 'prefix', label: 'Text before (optional, e.g. "HRS\\n")', default: '' },
		],
		callback: (fb) => {
			const c = self.findClock(fb.options.clock)
			if (!c) return {}
			const seg = self.connected ? segmentText(c, fb.options.segment, fb.options.withSign) : '--'
			return { text: `${fb.options.prefix || ''}${seg}` }
		},
	}

	f.shift_active = bool(
		'Time Shift is active',
		'True when the Time Shift is running at anything other than real time (1×).',
		AMBER,
		BLACK,
		[picker('shift', 'Time Shift', self.shiftChoices())],
		(fb) => {
			const s = self.findById('shifts', fb.options.shift)
			return !!s && Math.abs((s.rate ?? 1) - 1) > 1e-6
		},
	)

	// ---- Cue lights ---------------------------------------------------------------
	// The headline "monitoring" feedback: paint the button the cue light's live
	// colour so a Stream Deck key mirrors a physical GO/warning/stop tally.
	f.cuelight_color = {
		type: 'advanced',
		name: 'Cue light colour (live tally)',
		description: 'Sets the button background to the cue light’s current lit colour.',
		options: [picker('cue', 'Cue light', self.cueLightChoices())],
		callback: (fb) => {
			const bg = hexToRgbNumber(self.findCueLight(fb.options.cue)?.colorHex)
			return bg == null ? {} : { bgcolor: bg }
		},
	}

	// ---- Presets ------------------------------------------------------------------
	f.preset_selected = bool(
		'Preset is armed',
		'True when this preset is the armed (highlighted) one on its bank.',
		BLUE,
		WHITE,
		[picker('preset', 'Preset', self.allPresetChoices())],
		(fb) => {
			const [bank, preset] = String(fb.options.preset).split('::')
			return !!preset && self.findById('presetBanks', bank)?.selected === preset
		},
	)

	// ---- Schedule -----------------------------------------------------------------
	f.schedule_drift = bool(
		'Schedule is behind / ahead',
		'True when the show is running behind (or ahead of) the sheet by at least N seconds.',
		RED,
		WHITE,
		[
			picker('schedule', 'Schedule', self.scheduleChoices()),
			select('dir', 'When', 'behind', [
				['behind', 'Behind'],
				['ahead', 'Ahead'],
			]),
			{ type: 'number', id: 'seconds', label: 'By at least (seconds)', default: 60, min: 0, max: 86400 },
		],
		(fb) => {
			const d = self.findById('schedules', fb.options.schedule)?.driftSeconds
			if (d == null) return false
			const n = Number(fb.options.seconds)
			return fb.options.dir === 'ahead' ? -d >= n && d < 0 : d >= n && d > 0
		},
	)

	f.schedule_on_deck_running = bool(
		'Schedule on-deck cue is the running one',
		'True when Set & Start would restart the cue already running.',
		AMBER,
		BLACK,
		[picker('schedule', 'Schedule', self.scheduleChoices())],
		(fb) => !!self.findById('schedules', fb.options.schedule)?.onDeckIsRunning,
	)

	f.schedule_pco = bool(
		'Planning Center LIVE is…',
		'Planning Center schedules: LIVE is running, or this Mac is the LIVE controller.',
		GREEN,
		WHITE,
		[
			picker('schedule', 'Schedule (Planning Center)', self.pcoScheduleChoices()),
			select('when', 'When', 'live', [
				['live', 'LIVE is running'],
				['control', 'Cadence is in control'],
				['canTake', 'Control can be taken'],
			]),
		],
		(fb) => {
			const pco = self.findById('schedules', fb.options.schedule)?.pco
			if (!pco) return false
			return { live: !!pco.live, control: !!pco.canControl, canTake: !!pco.canTakeControl }[fb.options.when] ?? false
		},
	)

	f.schedule_can = bool(
		'Schedule button is available',
		'True when the chosen schedule action can run now (e.g. there IS a next cue).',
		GREEN,
		WHITE,
		[
			picker('schedule', 'Schedule', self.scheduleChoices()),
			select('what', 'Action', 'canSet', [
				['canSet', 'Set (a timer is wired and the cue has a duration)'],
				['canNext', 'Next'],
				['canPrev', 'Previous'],
			]),
		],
		(fb) => !!self.findById('schedules', fb.options.schedule)?.[fb.options.what],
	)

	// ---- Scheduler / automation / scene / message ----------------------------------
	f.scheduler_armed = bool(
		'Scheduler is armed',
		'True while the scheduler will fire its rows.',
		GREEN,
		WHITE,
		[picker('scheduler', 'Scheduler', self.schedulerChoices())],
		(fb) => !!self.findById('schedulers', fb.options.scheduler)?.armed,
	)

	f.automation_armed = bool(
		'Automation is armed',
		'True while the automation will fire at its time.',
		GREEN,
		WHITE,
		[picker('automation', 'Automation', self.automationChoices())],
		(fb) => !!self.findById('automations', fb.options.automation)?.armed,
	)

	f.automation_imminent = bool(
		'Automation fires within a minute',
		'True in the final minute before an armed automation fires.',
		AMBER,
		BLACK,
		[picker('automation', 'Automation', self.automationChoices())],
		(fb) => self.findById('automations', fb.options.automation)?.countdown != null,
	)

	f.scene_undo_available = bool(
		'Scene recall can be undone',
		'True while the last recall (optionally: of this scene) can still be undone.',
		BLUE,
		WHITE,
		[
			{
				...picker('scene', 'Scene (blank = any)', [{ id: '', label: 'Any scene' }, ...self.sceneChoices()]),
				default: '',
			},
		],
		(fb) => !!self.state.undoScene && (!fb.options.scene || fb.options.scene === self.state.undoScene),
	)

	f.message_vis = bool(
		'Message on-air state is…',
		'True when the message is hidden / shown / flashing.',
		RED,
		WHITE,
		[
			picker('message', 'Message', self.messageChoices()),
			select('vis', 'State', 'shown', [
				['shown', 'Shown'],
				['flashing', 'Flashing'],
				['onair', 'On air (shown or flashing)'],
				['hidden', 'Hidden'],
			]),
		],
		(fb) => {
			const vis = self.findById('messages', fb.options.message)?.vis
			if (!vis) return false
			return fb.options.vis === 'onair' ? vis !== 'hidden' : vis === fb.options.vis
		},
	)

	// ---- Cue stack / polls -----------------------------------------------------------
	f.cuestack_has_cues = bool(
		'Cue Stack has cues',
		'True when the timer’s cue stack is not empty (GO will do something).',
		GREEN,
		WHITE,
		[picker('clock', 'Cue Stack (timer)', self.cueStackChoices())],
		(fb) => (self.findCueStack(fb.options.clock)?.cues?.length ?? 0) > 0,
	)

	f.cuestack_mode = bool(
		'Cue Stack mode is…',
		'True when the stack is in Cue mode (GO takes the top cue off) or Presets mode (the list stays).',
		BLUE,
		WHITE,
		[
			picker('clock', 'Cue Stack (timer)', self.cueStackChoices()),
			select('mode', 'Mode', 'presets', [
				['queue', 'Cue'],
				['presets', 'Presets'],
			]),
		],
		(fb) => {
			const st = self.findCueStack(fb.options.clock)
			if (!st) return false
			return (st.mode === 'presets' ? 'presets' : 'queue') === fb.options.mode
		},
	)

	f.cuestack_selected = bool(
		'Cue Stack preset row is selected',
		'Presets mode: true when the given row (1 = first) is the one GO will load.',
		AMBER,
		BLACK,
		[
			picker('clock', 'Cue Stack (timer)', self.cueStackChoices()),
			{ type: 'number', id: 'row', label: 'Row (1 = first)', default: 1, min: 1, max: 50 },
		],
		(fb) => {
			const st = self.findCueStack(fb.options.clock)
			const cues = st?.cues ?? []
			if (st?.mode !== 'presets' || !cues.length) return false
			const sel = Math.max(
				0,
				cues.findIndex((c) => c.id === st.selected),
			)
			return sel === Number(fb.options.row) - 1
		},
	)

	f.poll_featured = bool(
		'Poll selected answer is on screen',
		'True while an open answer is shown on the poll graphic (Selected answer).',
		BLUE,
		WHITE,
		[picker('poll', 'Poll', self.pollChoices())],
		(fb) => !!self.findById('polls', fb.options.poll)?.featured,
	)

	f.poll_state = bool(
		'Poll voting state is…',
		'True when the poll is ready / open / closed.',
		GREEN,
		WHITE,
		[
			picker('poll', 'Poll', self.pollChoices()),
			select('state', 'State', 'open', [
				['ready', 'Ready (not yet open)'],
				['open', 'Open (voting)'],
				['closed', 'Closed'],
			]),
		],
		(fb) => self.findById('polls', fb.options.poll)?.state === fb.options.state,
	)

	f.poll_revealed = bool(
		'Poll results revealed on screen',
		'True while the poll’s results are revealed on the output graphics.',
		BLUE,
		WHITE,
		[picker('poll', 'Poll', self.pollChoices())],
		(fb) => !!self.findById('polls', fb.options.poll)?.revealed,
	)

	f.poll_room_live = bool(
		'Poll voting room is live',
		'True while the poll’s cloud voting room is connected (phones can vote).',
		GREEN,
		WHITE,
		[picker('poll', 'Poll', self.pollChoices())],
		(fb) => !!self.findById('polls', fb.options.poll)?.live,
	)

	f.poll_simulating = bool(
		'Poll is simulating',
		'True while the poll shows simulated (fake) votes — optionally only while they stream in, or while revealed.',
		AMBER,
		BLACK,
		[
			picker('poll', 'Poll', self.pollChoices()),
			select('when', 'When', 'simulating', [
				['simulating', 'Simulating (any phase)'],
				['streaming', 'Fake votes streaming in'],
				['revealed', 'Simulated results revealed'],
			]),
		],
		(fb) => {
			const p = self.findById('polls', fb.options.poll)
			if (!p?.simulating) return false
			if (fb.options.when === 'streaming') return !!p.simStreaming
			if (fb.options.when === 'revealed') return !!p.simRevealed
			return true
		},
	)

	// ---- Outputs (read-only status; whole-show scope) ----------------------------
	f.output_enabled = bool(
		'Output is on',
		'True while the output is enabled in Cadence (status only — Companion can’t switch outputs).',
		GREEN,
		WHITE,
		[picker('output', 'Output', self.outputChoices())],
		(fb) => !!self.findById('outputs', fb.options.output)?.enabled,
	)

	f.output_shows = bool(
		'Output is showing…',
		'True when the output is fed by the chosen design / page / clock / schedule (by name).',
		BLUE,
		WHITE,
		[
			picker('output', 'Output', self.outputChoices()),
			{ type: 'textinput', id: 'source', label: 'Source name (exact, case-insensitive)', default: '' },
		],
		(fb) => {
			const o = self.findById('outputs', fb.options.output)
			const want = String(fb.options.source || '')
				.trim()
				.toLowerCase()
			return !!o && !!want && String(o.sourceName || '').toLowerCase() === want
		},
	)

	// ---- Connection -------------------------------------------------------------------
	f.offline = bool(
		'Cadence offline',
		'True when the module can’t reach the Cadence producer server.',
		combineRgb(120, 0, 0),
		combineRgb(255, 180, 180),
		[],
		() => !self.connected,
	)

	self.setFeedbackDefinitions(f)
}

module.exports = { setFeedbacks, hexToRgbNumber, contrastText, segmentText }
