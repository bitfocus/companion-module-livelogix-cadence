const { combineRgb } = require('@companion-module/base')

const BLACK = combineRgb(0, 0, 0)
const WHITE = combineRgb(255, 255, 255)
const DARK = combineRgb(20, 22, 28)
const GREEN = combineRgb(0, 140, 55)
const AMBER = combineRgb(210, 130, 0)
const RED = combineRgb(200, 30, 30)
const BLUE = combineRgb(20, 90, 200)

function setPresets(self) {
	const presets = {}
	// Reference this connection's own variables by its current label.
	const v = (name) => `$(${self.label}:${name})`
	const key = (id) =>
		String(id)
			.toLowerCase()
			.replace(/[^a-z0-9_]/g, '_')

	// A button: text/style, one press sequence, and feedbacks.
	const button = (category, name, text, down, feedbacks = [], style = {}) => ({
		type: 'button',
		category,
		name,
		// 'auto' suits multi-line labels; short labels pass a fixed size (see SIZE) —
		// Companion's auto-size enlarges short text by splitting words ("PRE·V Q").
		style: { text, size: 'auto', color: WHITE, bgcolor: DARK, ...style },
		steps: [{ down, up: [] }],
		feedbacks,
	})
	const act = (actionId, options) => ({ actionId, options })
	// A line of text in the Presets panel: what a Cadence feature does, and where to read more.
	const text = (category, name, body) => ({ type: 'text', category, name, text: body })
	const SITE = 'https://cadence.livelogix.app'
	// Fixed sizes measured on a 72 px key: 14 ≈ 5 capitals / 6 digits per line,
	// 18 ≈ 4–5 characters.
	const SIZE = { small: '14', medium: '18' }

	// ---- Timers ------------------------------------------------------------------------
	self.timers().forEach((c, i) => {
		const n = i + 1
		const cat = `Timer ${n}: ${c.name || c.id}`
		const pick = { pick: c.id, overrideId: '' }
		presets[`timer_${n}_toggle`] = button(
			cat,
			'Start/Pause + live time (state colours)',
			`${v(`timer_${n}_name`)}\\n${v(`timer_${n}_time`)}`,
			[act('timer_transport', { ...pick, action: 'toggle' })],
			[
				{ feedbackId: 'timer_running', options: { clock: c.id }, style: { bgcolor: GREEN, color: WHITE } },
				{
					feedbackId: 'timer_mood',
					options: { clock: c.id, mood: 'warning' },
					style: { bgcolor: AMBER, color: BLACK },
				},
				{ feedbackId: 'timer_mood', options: { clock: c.id, mood: 'danger' }, style: { bgcolor: RED, color: WHITE } },
				{ feedbackId: 'timer_mood', options: { clock: c.id, mood: 'expired' }, style: { bgcolor: RED, color: WHITE } },
			],
		)
		if (c.stopwatch) {
			// Stopwatch: MARK records the elapsed time (lit while it runs) and shows the newest mark.
			presets[`timer_${n}_mark`] = button(
				cat,
				'Stopwatch: MARK + newest mark',
				`MARK\\n${v(`stopwatch_${key(c.id)}_last`)}`,
				[act('stopwatch_mark', pick)],
				[{ feedbackId: 'timer_running', options: { clock: c.id }, style: { bgcolor: BLUE, color: WHITE } }],
			)
		}
		presets[`timer_${n}_mirror`] = button(
			cat,
			'Live time in the on-screen colour',
			`${v(`timer_${n}_time`)}`,
			[act('timer_transport', { ...pick, action: 'toggle' })],
			[{ feedbackId: 'clock_color', options: { clock: c.id, autoText: true } }],
			{ size: SIZE.small },
		)
		// Big digits: hours / minutes / seconds on three keys, in the on-screen colour.
		for (const [seg, label, text] of [
			['hh', 'hours (with − in overtime)', `${v(`timer_${n}_sign`)}${v(`timer_${n}_hh`)}`],
			['mm', 'minutes', v(`timer_${n}_mm`)],
			['ss', 'seconds', v(`timer_${n}_ss`)],
		]) {
			presets[`timer_${n}_big_${seg}`] = button(
				cat,
				`Big digits: ${label}`,
				text,
				[act('timer_transport', { ...pick, action: 'toggle' })],
				[{ feedbackId: 'clock_color', options: { clock: c.id, autoText: true } }],
			)
		}
		presets[`timer_${n}_reset`] = button(cat, 'Reset', `RESET\\n${v(`timer_${n}_name`)}`, [
			act('timer_transport', { ...pick, action: 'reset' }),
		])
		presets[`timer_${n}_plus`] = button(cat, '+1:00', '+1:00', [act('timer_adjust', { ...pick, seconds: '60' })], [], {
			size: SIZE.medium,
			bgcolor: combineRgb(0, 70, 40),
		})
		presets[`timer_${n}_minus`] = button(
			cat,
			'−1:00',
			'−1:00',
			[act('timer_adjust', { ...pick, seconds: '-60' })],
			[],
			{
				size: SIZE.medium,
				bgcolor: combineRgb(70, 40, 0),
			},
		)
		presets[`timer_${n}_undo`] = button(
			cat,
			'Undo last edit',
			`UNDO\\n${v(`timer_${n}_undo`)}s`,
			[act('timer_undo', { ...pick })],
			[{ feedbackId: 'timer_undo_available', options: { clock: c.id }, style: { bgcolor: BLUE, color: WHITE } }],
		)
	})

	// ---- Schedules ----------------------------------------------------------------------
	for (const s of self.state.schedules) {
		const cat = `Schedule: ${s.name || s.id}`
		const k = key(s.id)
		presets[`sched_${k}_about`] = text(
			cat,
			'Run of show',
			`Cadence runs the schedule you already have (a live Google Sheet, Excel or CSV) cue by cue, with ahead / behind and a projected end time. More: ${SITE}/#schedule`,
		)
		presets[`sched_${k}_setstart`] = button(
			cat,
			'Set & Start on-deck cue',
			`GO\\n${v(`schedule_${k}_ondeck`)}`,
			[act('schedule_control', { schedule: s.id, action: 'schedSetStart' })],
			[
				{
					feedbackId: 'schedule_can',
					options: { schedule: s.id, what: 'canSet' },
					style: { bgcolor: GREEN, color: WHITE },
				},
				{
					feedbackId: 'schedule_on_deck_running',
					options: { schedule: s.id },
					style: { bgcolor: AMBER, color: BLACK },
				},
			],
		)
		presets[`sched_${k}_next`] = button(
			cat,
			'Next cue',
			`NEXT ▶\\n${v(`schedule_${k}_position`)}`,
			[act('schedule_control', { schedule: s.id, action: 'schedNext' })],
			[
				{
					feedbackId: 'schedule_can',
					options: { schedule: s.id, what: 'canNext' },
					style: { bgcolor: BLUE, color: WHITE },
				},
			],
		)
		presets[`sched_${k}_prev`] = button(
			cat,
			'Previous cue',
			`◀ PREV\\n${v(`schedule_${k}_position`)}`,
			[act('schedule_control', { schedule: s.id, action: 'schedPrev' })],
			[
				{
					feedbackId: 'schedule_can',
					options: { schedule: s.id, what: 'canPrev' },
					style: { bgcolor: BLUE, color: WHITE },
				},
			],
		)
		presets[`sched_${k}_status`] = button(
			cat,
			'Ahead/behind readout (red when 1+ min behind)',
			`${v(`schedule_${k}_position`)}\\n${v(`schedule_${k}_drift`)}`,
			[],
			[
				{
					feedbackId: 'schedule_drift',
					options: { schedule: s.id, dir: 'behind', seconds: 60 },
					style: { bgcolor: RED, color: WHITE },
				},
				{
					feedbackId: 'schedule_drift',
					options: { schedule: s.id, dir: 'ahead', seconds: 60 },
					style: { bgcolor: GREEN, color: WHITE },
				},
			],
		)
	}

	// ---- Cue stacks ------------------------------------------------------------------------
	for (const st of self.state.cueStacks) {
		const k = key(st.clock)
		presets[`stack_${k}_go`] = button(
			`Cue Stack: ${st.name || st.clock}`,
			'GO (load top cue + start)',
			`GO ${v(`cuestack_${k}_count`)}\\n${v(`cuestack_${k}_next`)}`,
			[act('cuestack_control', { clock: st.clock, action: 'stackGo' })],
			[{ feedbackId: 'cuestack_has_cues', options: { clock: st.clock }, style: { bgcolor: GREEN, color: WHITE } }],
		)
		presets[`stack_${k}_mode`] = button(
			`Cue Stack: ${st.name || st.clock}`,
			'Mode: Cue / Presets (toggle)',
			`MODE\n${v(`cuestack_${k}_mode`)}`,
			[act('cuestack_mode', { clock: st.clock, mode: 'toggle' })],
			[
				{
					feedbackId: 'cuestack_mode',
					options: { clock: st.clock, mode: 'presets' },
					style: { bgcolor: BLUE, color: WHITE },
				},
			],
		)
		presets[`stack_${k}_sel_prev`] = button(
			`Cue Stack: ${st.name || st.clock}`,
			'Presets: select previous row',
			`▲ PRESET\n${v(`cuestack_${k}_selected_position`)}`,
			[act('cuestack_select', { clock: st.clock, which: 'prev', number: '1' })],
		)
		presets[`stack_${k}_sel_next`] = button(
			`Cue Stack: ${st.name || st.clock}`,
			'Presets: select next row',
			`▼ PRESET\n${v(`cuestack_${k}_selected_position`)}`,
			[act('cuestack_select', { clock: st.clock, which: 'next', number: '1' })],
		)
	}

	// ---- Planning Center LIVE (schedules linked to Planning Center) ---------------------------
	for (const s of self.state.schedules.filter((x) => x.pco)) {
		const cat = `Schedule: ${s.name || s.id}`
		const k = key(s.id)
		presets[`pco_${k}_next`] = button(
			cat,
			'Planning Center LIVE: Next item',
			`LIVE ▶\n${v(`schedule_${k}_pco_remaining`)}`,
			[act('schedule_pco', { schedule: s.id, action: 'pcoNext' })],
			[
				{
					feedbackId: 'schedule_pco',
					options: { schedule: s.id, when: 'live' },
					style: { bgcolor: GREEN, color: WHITE },
				},
			],
		)
		presets[`pco_${k}_back`] = button(
			cat,
			'Planning Center LIVE: Back',
			'LIVE ◀',
			[act('schedule_pco', { schedule: s.id, action: 'pcoBack' })],
			[],
			{ size: SIZE.small },
		)
		presets[`pco_${k}_take`] = button(
			cat,
			'Planning Center LIVE: Take control',
			'TAKE\nLIVE',
			[act('schedule_pco', { schedule: s.id, action: 'pcoTakeControl' })],
			[
				{
					feedbackId: 'schedule_pco',
					options: { schedule: s.id, when: 'control' },
					style: { bgcolor: GREEN, color: WHITE },
				},
			],
		)
	}

	// ---- Polls ------------------------------------------------------------------------------
	for (const p of self.state.polls) {
		const cat = `Poll: ${p.name || p.id}`
		const k = key(p.id)
		presets[`poll_${k}_about`] = text(
			cat,
			'Audience polls',
			`The audience votes from their phones (scan a QR code or type a short link, no app to install) and results build live on every output Cadence drives: bars, donuts, leaderboards, word and bubble clouds. More: ${SITE}/#polls`,
		)
		presets[`poll_${k}_open`] = button(
			cat,
			'Open / Close voting',
			`VOTE\\n${v(`poll_${k}_state`)}`,
			[act('poll_control', { poll: p.id, action: 'toggleOpen' })],
			[
				{ feedbackId: 'poll_state', options: { poll: p.id, state: 'open' }, style: { bgcolor: GREEN, color: WHITE } },
				{ feedbackId: 'poll_state', options: { poll: p.id, state: 'closed' }, style: { bgcolor: RED, color: WHITE } },
			],
		)
		presets[`poll_${k}_reveal`] = button(
			cat,
			'Reveal / hide results on screen',
			`REVEAL\\n${v(`poll_${k}_votes`)} votes`,
			[act('poll_control', { poll: p.id, action: 'toggleReveal' })],
			[{ feedbackId: 'poll_revealed', options: { poll: p.id }, style: { bgcolor: BLUE, color: WHITE } }],
		)
		presets[`poll_${k}_next`] = button(cat, 'Next question', `NEXT Q\\n${v(`poll_${k}_position`)}`, [
			act('poll_control', { poll: p.id, action: 'pollNext' }),
		])
		presets[`poll_${k}_prev`] = button(cat, 'Previous question', `PREV Q\\n${v(`poll_${k}_position`)}`, [
			act('poll_control', { poll: p.id, action: 'pollPrev' }),
		])
		presets[`poll_${k}_featured`] = button(
			cat,
			'Selected answer: show top / hide (open answers)',
			`ANSWER\\n${v(`poll_${k}_featured`)}`,
			[act('poll_featured', { poll: p.id, what: 'toggle', rank: '1' })],
			[{ feedbackId: 'poll_featured', options: { poll: p.id }, style: { bgcolor: BLUE, color: WHITE } }],
		)
		presets[`poll_${k}_simulate`] = button(
			cat,
			'Simulate votes (start / stop)',
			`SIM\\n${v(`poll_${k}_sim_state`)}`,
			[act('poll_simulate', { poll: p.id, action: 'toggle' })],
			[
				{
					feedbackId: 'poll_simulating',
					options: { poll: p.id, when: 'simulating' },
					style: { bgcolor: AMBER, color: BLACK },
				},
				{
					feedbackId: 'poll_simulating',
					options: { poll: p.id, when: 'streaming' },
					style: { bgcolor: GREEN, color: WHITE },
				},
			],
			{ size: SIZE.small },
		)
		presets[`poll_${k}_sim_reveal`] = button(
			cat,
			'Simulated results: reveal / hide',
			'SIM\\nReveal',
			[act('poll_simulate', { poll: p.id, action: 'toggleReveal' })],
			[
				{
					feedbackId: 'poll_simulating',
					options: { poll: p.id, when: 'revealed' },
					style: { bgcolor: BLUE, color: WHITE },
				},
			],
			{ size: SIZE.small },
		)
		presets[`poll_${k}_leader`] = button(
			cat,
			'Leading answer readout',
			`${v(`poll_${k}_leader`)}\\n${v(`poll_${k}_leader_percent`)}%`,
			[],
		)
	}

	// ---- Messages (3 lines: auto-size then shrinks to keep the user's name whole
	// instead of enlarging it and splitting a word) -----------------------------------------------------------------------------
	for (const m of self.state.messages) {
		presets[`msg_${key(m.id)}`] = button(
			'Messages',
			`${m.name || m.id}: Show / Hide`,
			`MSG\\n${m.name || 'Message'}\\n${v(`message_${key(m.id)}_vis`)}`,
			[act('message_visibility', { message: m.id, vis: 'toggle' })],
			[
				{ feedbackId: 'message_vis', options: { message: m.id, vis: 'shown' }, style: { bgcolor: RED, color: WHITE } },
				{
					feedbackId: 'message_vis',
					options: { message: m.id, vis: 'flashing' },
					style: { bgcolor: AMBER, color: BLACK },
				},
			],
		)
	}

	// ---- Scenes / automations / schedulers / presets / shifts / ProPresenter ---------
	for (const s of self.state.scenes) {
		presets[`scene_${key(s.id)}`] = button(
			'Scenes',
			`Recall ${s.name || s.id}`,
			`SCENE\\n${s.name || 'Scene'}\\nrecall`,
			[act('scene_recall', { scene: s.id })],
		)
	}
	if (self.state.scenes.length) {
		presets['scene_undo'] = button(
			'Scenes',
			'Undo last recall',
			`UNDO\\n${v('scene_undo_remaining')}s`,
			[act('scene_undo', {})],
			[{ feedbackId: 'scene_undo_available', options: { scene: '' }, style: { bgcolor: BLUE, color: WHITE } }],
		)
	}

	for (const a of self.state.automations) {
		presets[`auto_${key(a.id)}`] = button(
			'Automations',
			`${a.name || a.id}: Arm / Disarm`,
			`${a.name || 'AUTO'}\\n${v(`automation_${key(a.id)}_time`)}`,
			[act('automation_arm', { automation: a.id, armed: 'toggle' })],
			[
				{ feedbackId: 'automation_armed', options: { automation: a.id }, style: { bgcolor: GREEN, color: WHITE } },
				{ feedbackId: 'automation_imminent', options: { automation: a.id }, style: { bgcolor: AMBER, color: BLACK } },
			],
		)
	}

	for (const s of self.state.schedulers) {
		const k = key(s.id)
		presets[`schr_${k}_arm`] = button(
			'Schedulers',
			`${s.name || s.id}: Arm / Disarm`,
			`${s.name || 'SCHED'}\\n${v(`scheduler_${k}_next_trigger`)}`,
			[act('scheduler_control', { scheduler: s.id, action: 'toggle' })],
			[{ feedbackId: 'scheduler_armed', options: { scheduler: s.id }, style: { bgcolor: GREEN, color: WHITE } }],
		)
		presets[`schr_${k}_fire`] = button(
			'Schedulers',
			`${s.name || s.id}: Fire next row`,
			`FIRE\\n${v(`scheduler_${k}_next_title`)}`,
			[act('scheduler_control', { scheduler: s.id, action: 'schFireNext' })],
		)
	}

	for (const b of self.state.presetBanks) {
		for (const p of b.presets || []) {
			const id = `${b.id}::${p.id}`
			presets[`preset_${key(b.id)}_${key(p.id)}`] = button(
				`Presets: ${b.name || b.id}`,
				`${p.label} — Set & Start`,
				`${p.label}\\n${p.time}`,
				[act('preset_apply', { preset: id, mode: 'setStart' })],
				[{ feedbackId: 'preset_selected', options: { preset: id }, style: { bgcolor: BLUE, color: WHITE } }],
			)
		}
	}

	for (const s of self.state.shifts) {
		for (const rate of [0.9, 1, 1.1]) {
			presets[`shift_${key(s.id)}_${String(rate).replace('.', '_')}`] = button(
				`Time Shift: ${s.name || s.id}`,
				`Rate ${rate}×`,
				`${rate}×`,
				[act('shift_rate', { shift: s.id, value: String(rate) })],
				rate === 1
					? []
					: [{ feedbackId: 'shift_active', options: { shift: s.id }, style: { bgcolor: AMBER, color: BLACK } }],
				{ size: SIZE.medium },
			)
		}
	}

	for (const c of self.state.clocks.filter((x) => x.ppControl)) {
		for (const [action, label] of [
			['ppStart', 'START'],
			['ppStop', 'STOP'],
			['ppReset', 'RESET'],
		]) {
			presets[`pp_${key(c.id)}_${action}`] = button(
				`ProPresenter: ${c.name || c.id}`,
				label,
				`PP ${label}\\n${v(`clock_${key(c.id)}_time`)}`,
				[act('propresenter_timer', { clock: c.id, action })],
			)
		}
	}

	// ---- Outputs (status only) --------------------------------------------------------
	for (const o of self.state.outputs) {
		const k = key(o.id)
		presets[`output_${k}`] = button(
			'Outputs (status)',
			`${o.name || o.id}: on/off + what it shows`,
			`${o.name || 'OUT'}\\n${v(`output_${k}_source`)}`,
			[],
			[{ feedbackId: 'output_enabled', options: { output: o.id }, style: { bgcolor: GREEN, color: WHITE } }],
		)
	}

	// ---- Cue light tally ------------------------------------------------------------------------
	for (const c of self.state.cueLights) {
		presets[`cuelight_${key(c.id)}`] = button(
			'Cue Lights',
			`Cue light: ${c.name || c.id}`,
			c.name || 'CUE',
			[],
			[{ feedbackId: 'cuelight_color', options: { cue: c.id } }],
		)
	}

	// ---- Status ----------------------------------------------------------------------------------
	presets['about'] = text(
		'Status',
		'About Cadence',
		`Cadence is the countdown clock and show timer for Mac: one synced engine for displays, the web, NDI, SDI, vMix and wall clocks, with audience polls, run-of-show schedules and remote producer pages. Free beta, everything unlocked: ${SITE}`,
	)
	presets['status'] = button(
		'Status',
		'Cadence connection + clock status',
		`${v('page_title')}\\n${v('connection_state')}`,
		[],
		[
			{
				feedbackId: 'offline',
				options: {},
				style: { bgcolor: combineRgb(120, 0, 0), color: combineRgb(255, 180, 180) },
			},
		],
	)

	self.setPresetDefinitions(presets)
}

module.exports = { setPresets }
