// State helpers shared by the Companion instance (main.js) and the offline
// tests. Mixed onto the instance, so every method reads `this.state` — the
// latest /api/state snapshot from a Cadence Producer server.

const LIST_KEYS = [
	'clocks',
	'shifts',
	'cueLights',
	'presetBanks',
	'schedules',
	'schedulers',
	'scenes',
	'messages',
	'automations',
	'cueStacks',
	'polls',
	'outputs', // whole-show scope only, read-only
]

const EMPTY_STATE = Object.freeze({ clockStatus: '', now: 0 })

function arr(v) {
	return Array.isArray(v) ? v : []
}

// Normalise a raw snapshot into the module's state shape (missing keys → empty),
// so older Cadence builds that lack a section simply expose nothing for it.
function normalizeSnapshot(snap) {
	snap = snap || {}
	const state = {
		clockStatus: snap.clockStatus || '',
		now: snap.now || Date.now() / 1000,
		scope: snap.scope === 'show' ? 'show' : 'page',
		pageTitle: snap.page?.title || '',
		undoScene: snap.undoScene || null,
		undoRemaining: typeof snap.undoRemaining === 'number' ? snap.undoRemaining : null,
	}
	for (const k of LIST_KEYS) state[k] = arr(snap[k])
	return state
}

// "5:00", "1:02:03", "90" → seconds (null if unparseable).
function parseDuration(input) {
	const s = String(input ?? '').trim()
	if (s === '') return null
	if (s.includes(':')) {
		const parts = s.split(':').map((p) => Number(p))
		if (parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null
		let secs = 0
		for (const p of parts) secs = secs * 60 + p
		return Math.round(secs)
	}
	const n = Number(s)
	return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

// "14:30", "2:30 PM", "2:30:15pm", "9am" → seconds since midnight (null if bad).
function parseTimeOfDay(input) {
	const m = /^\s*(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i.exec(String(input ?? ''))
	if (!m) return null
	let h = Number(m[1])
	const min = Number(m[2] || 0)
	const sec = Number(m[3] || 0)
	if (min > 59 || sec > 59) return null
	if (m[4]) {
		if (h < 1 || h > 12) return null
		const pm = m[4].toLowerCase() === 'p'
		if (h === 12) h = pm ? 12 : 0
		else if (pm) h += 12
	} else if (h > 23) return null
	return h * 3600 + min * 60 + sec
}

// Split a clock's DISPLAYED time into segments, so per-segment buttons always
// match the screen exactly (Cadence's own rounding, overtime sign, formats):
//   timers "05:00" / "01:02:03" / "−05:00" (overtime) · time of day "4:05 PM",
//   "16:05:30" · timecode "01:02:03:04" · placeholders "--:--", "NO LTC".
// Returns { hh, mm, ss, ff, sign, ampm } — missing segments are '' (and a
// placeholder's digits are '--').
function clockSegments(clock) {
	const out = { hh: '', mm: '', ss: '', ff: '', sign: '', ampm: '' }
	let t = String(clock?.primary ?? '').trim()
	if (!t || !t.includes(':')) return out
	// A sign only when a digit follows — "--:--" is a placeholder, not "-" + "-:--".
	const signMatch = /^[−\-+](?=\s*\d)/.exec(t)
	if (signMatch) {
		out.sign = signMatch[0] === '+' ? '+' : '-'
		t = t.slice(1).trim()
	}
	const ampm = /\s*([AaPp][Mm])$/.exec(t)
	if (ampm) {
		out.ampm = ampm[1].toUpperCase()
		t = t.slice(0, ampm.index).trim()
	}
	const parts = t.split(':').map((p) => p.trim())
	const pad = (p) => (/^\d+$/.test(p) ? p.padStart(2, '0') : p)
	const tod = clock?.kind === 'timeOfDay'
	if (tod) {
		// Time of day: hours as shown ("4" in 12-hour, "16" in 24-hour).
		out.hh = parts[0]
		out.mm = pad(parts[1] ?? '')
		out.ss = pad(parts[2] ?? '')
	} else if (parts.length === 2) {
		// Timers under an hour: MM:SS.
		out.hh = '00'
		out.mm = pad(parts[0])
		out.ss = pad(parts[1])
	} else if (parts.length >= 3) {
		out.hh = pad(parts[0])
		out.mm = pad(parts[1])
		out.ss = pad(parts[2])
		if (parts.length >= 4) out.ff = pad(parts[3]) // timecode frames
	}
	// A placeholder ("--:--") has no real hours either.
	if (/^-+$/.test(out.mm) && out.hh === '00') out.hh = '--'
	return out
}

const choice = (list, label) => list.map((x) => ({ id: x.id, label: label ? label(x) : x.name || x.id }))

// Companion connection status values (mirrors @companion-module/base's
// InstanceStatus, kept local so the offline tests don't need the IPC runtime).
const Status = { Ok: 'ok', Connecting: 'connecting', ConnectionFailure: 'connection_failure', BadConfig: 'bad_config' }

// Whole show → Cadence's /api/show/* (every element); page → a Producer page's /api/*.
function endpoints(config) {
	return config?.scope === 'page'
		? { state: '/api/state', command: '/api/command' }
		: { state: '/api/show/state', command: '/api/show/command' }
}

// Turn a failed state pull into an operator-actionable message + status.
function describeFailure(config, { httpStatus, error, network, notCadence } = {}) {
	const where = config?.host ? ` at ${config.host}:${config.port || 8730}` : ''
	if (notCadence) {
		// Something answered on that port, but not with Cadence's reply.
		return {
			status: Status.BadConfig,
			message: `That isn't Cadence${where} — the reply wasn't Cadence's. Check the port (Cadence's app port is 8730).`,
		}
	}
	if (httpStatus === 404 && config?.scope !== 'page') {
		return {
			status: Status.BadConfig,
			message:
				'This Cadence doesn’t offer whole-show control on this port — use the app port (8730) with an updated Cadence, or set Control scope to "One Producer page".',
		}
	}
	if (error) return { status: Status.BadConfig, message: error } // Cadence refused (e.g. switched off)
	if (httpStatus) return { status: Status.ConnectionFailure, message: `HTTP ${httpStatus}` }
	return {
		status: Status.ConnectionFailure,
		message: `No response from Cadence${where}${network ? ` (${network})` : ''}. Is Cadence open on that Mac? Don't have it yet? cadence.livelogix.app`,
	}
}

const methods = {
	// Forget the previous target entirely — call whenever host/port change, so the
	// next successful poll reports OK again (and definitions rebuild for the new
	// producer page's entities).
	resetConnection() {
		this.connected = false
		this.lastShapeSig = ''
		this.updateStatus(Status.Connecting)
	},

	// A poll succeeded: take the snapshot and (re)report OK if we weren't already.
	pollSucceeded(snap) {
		// Mark connected BEFORE applying, so the values pushed now are live ones
		// (updateVariables blanks times while disconnected).
		const wasConnected = this.connected
		this.connected = true
		this.applySnapshot(snap)
		if (!wasConnected) this.updateStatus(Status.Ok)
	},

	// A poll failed: report once per distinct problem, and blank live values so
	// buttons don't show a frozen countdown. `failure` is a describeFailure()
	// result or a bare message (connection failure).
	pollFailed(failure) {
		const f =
			typeof failure === 'object' && failure
				? failure
				: { status: Status.ConnectionFailure, message: failure || 'no response' }
		const key = `DOWN:${f.status}:${f.message}`
		if (this.connected || this.lastShapeSig !== key) {
			this.connected = false
			this.lastShapeSig = key
			this.updateStatus(f.status, f.message)
			this.refreshValues()
		}
	},

	// Handle a parsed /api/(show/)state reply: a refusal ({ok:false,error}) is a
	// failure with Cadence's own explanation; anything else is a snapshot.
	handleStateReply(snap) {
		if (snap && snap.ok === false) return this.pollFailed(describeFailure(this.config, { error: snap.error }))
		this.pollSucceeded(snap)
	},

	applySnapshot(snap) {
		this.state = normalizeSnapshot(snap)
		// Rebuild dropdowns/variable definitions only when the set of entities
		// changes — values change every tick, the option lists rarely do.
		const sig = this.shapeSignature()
		if (sig !== this.lastShapeSig) {
			this.lastShapeSig = sig
			this.rebuildDefinitions()
		}
		this.refreshValues()
	},

	baseURL() {
		const host = String(this.config?.host || '127.0.0.1').trim()
		const port = this.config?.port || 8730
		return `http://${host}:${port}`
	},

	// POST a command to the Cadence producer server. `body` is the wire object.
	// Resolves to the ack ({ok, error}); never throws.
	async sendCommand(body) {
		try {
			const res = await fetch(`${this.baseURL()}${endpoints(this.config).command}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			const ack = await res.json().catch(() => ({}))
			if (ack && ack.ok === false) {
				this.log('warn', `Cadence rejected command: ${ack.error || 'unknown'} (${JSON.stringify(body)})`)
			}
			// Pull fresh state immediately so buttons reflect the change without
			// waiting for the next poll tick.
			if (!this.destroyed) this.poll()
			return ack
		} catch (e) {
			this.log('error', `Command failed: ${e.message}`)
			return { ok: false, error: e.message }
		}
	},

	// A signature of the entity *shape* (which timers/cue lights/etc. exist) so
	// dropdowns and variable definitions are rebuilt only when the set changes,
	// not on every poll (values change constantly; the option lists rarely do).
	shapeSignature() {
		// Names are part of the shape, so a rename in Cadence refreshes dropdown
		// labels, variable descriptions and preset names (not just the values).
		const s = this.state
		const ids = (list, extra) =>
			arr(list)
				.map((x) => `${extra ? extra(x) : x.id}=${x.name ?? ''}`)
				.join(',')
		return [
			ids(s.clocks, (c) => `${c.id}:${c.kind}:${c.ppControl ? 'pp' : ''}:${c.stopwatch ? 'sw' : ''}`),
			ids(s.shifts),
			ids(s.cueLights),
			ids(
				s.presetBanks,
				(b) =>
					`${b.id}:${arr(b.presets)
						.map((p) => `${p.id}~${p.label}~${p.time}`)
						.join('|')}`,
			),
			// The Planning Center link decides the LIVE presets and the schedule dropdown.
			ids(s.schedules, (x) => `${x.id}:${x.pco ? 'pco' : ''}`),
			ids(s.schedulers),
			ids(s.scenes),
			ids(s.messages),
			ids(s.automations),
			ids(s.cueStacks, (c) => c.clock),
			ids(s.polls),
			ids(s.outputs, (o) => `${o.id}:${o.kind ?? ''}`), // the kind is in the dropdown label
		].join(';;')
	},

	timers() {
		return this.state.clocks.filter((c) => c.kind === 'countdown')
	},

	timerChoices() {
		return choice(this.timers())
	},
	// Stopwatch sources (timers that always count up, with Mark).
	stopwatchChoices() {
		return choice(this.timers().filter((c) => c.stopwatch))
	},
	clockChoices() {
		return choice(this.state.clocks, (c) => `${c.name || c.id} (${c.kind})`)
	},
	proPresenterChoices() {
		return choice(this.state.clocks.filter((c) => c.ppControl))
	},
	shiftChoices() {
		return choice(this.state.shifts)
	},
	cueLightChoices() {
		return choice(this.state.cueLights)
	},
	presetBankChoices() {
		return choice(this.state.presetBanks)
	},
	presetChoices(bankId) {
		const bank = this.state.presetBanks.find((b) => b.id === bankId) || this.state.presetBanks[0]
		return arr(bank?.presets).map((p) => ({ id: p.id, label: `${p.label} (${p.time})` }))
	},
	// Every preset across every bank, labelled with its bank — one flat dropdown,
	// so a button can't end up pointing at a preset from the wrong bank.
	allPresetChoices() {
		const out = []
		for (const b of this.state.presetBanks)
			for (const p of arr(b.presets))
				out.push({ id: `${b.id}::${p.id}`, label: `${b.name || b.id} › ${p.label} (${p.time})` })
		return out
	},
	scheduleChoices() {
		return choice(this.state.schedules)
	},
	// Planning Center schedules (they carry Services LIVE state); all schedules
	// until one reports it, so a button can be set up before LIVE is connected.
	pcoScheduleChoices() {
		const pco = arr(this.state.schedules).filter((s) => s.pco)
		return choice(pco.length ? pco : this.state.schedules)
	},
	schedulerChoices() {
		return choice(this.state.schedulers)
	},
	sceneChoices() {
		return choice(this.state.scenes)
	},
	messageChoices() {
		return choice(this.state.messages)
	},
	automationChoices() {
		return choice(this.state.automations)
	},
	// Cue stacks are addressed by the timer they drive.
	cueStackChoices() {
		return this.state.cueStacks.map((s) => ({ id: s.clock, label: s.name || s.clock }))
	},
	pollChoices() {
		return choice(this.state.polls)
	},
	outputChoices() {
		return choice(this.state.outputs, (o) => `${o.name || o.id} (${o.kind})`)
	},

	findClock(id) {
		return this.state.clocks.find((c) => c.id === id)
	},
	findCueLight(id) {
		return this.state.cueLights.find((c) => c.id === id)
	},
	findById(key, id) {
		return arr(this.state[key]).find((x) => x.id === id)
	},
	findCueStack(clockId) {
		return this.state.cueStacks.find((s) => s.clock === clockId)
	},
}

module.exports = {
	clockSegments,
	Status,
	endpoints,
	describeFailure,
	EMPTY_STATE,
	LIST_KEYS,
	normalizeSnapshot,
	parseDuration,
	parseTimeOfDay,
	methods,
	arr,
}
