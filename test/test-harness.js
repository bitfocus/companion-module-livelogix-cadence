// Live smoke test against a RUNNING Cadence: pull a real snapshot and build every
// definition from it with the module's real code, asserting nothing throws and
// every declared variable gets a value. Read-only — the only command sent is a
// deliberately malformed one, to prove Cadence rejects it gracefully.
//
//   node test-harness.js [port] [host] [show|page]   (default 8730 127.0.0.1 show)
const { makeFakeSelf } = require('./fake-self')
const { setActions } = require('../src/actions')
const { setFeedbacks } = require('../src/feedbacks')
const { setPresets } = require('../src/presets')
const { initVariables, updateVariables } = require('../src/variables')
const { LIST_KEYS, endpoints } = require('../src/helpers')

const PORT = Number(process.argv[2] || 8730)
const HOST = process.argv[3] || '127.0.0.1'
const SCOPE = process.argv[4] === 'page' ? 'page' : 'show'
const BASE = `http://${HOST}:${PORT}`
const EP = endpoints({ scope: SCOPE })

let failures = 0
function assert(cond, msg) {
	console.log(`  ${cond ? '✓' : '✗'} ${msg}`)
	if (!cond) failures++
}

async function main() {
	console.log(`Pulling snapshot from ${BASE}${EP.state} (scope: ${SCOPE}) …`)
	const res = await fetch(`${BASE}${EP.state}`)
	if (!res.ok)
		throw new Error(
			`HTTP ${res.status} — ${SCOPE === 'show' ? 'no whole-show route here (old Cadence, or a Producer node port?)' : 'not a producer page'}`,
		)
	const snap = await res.json()
	if (snap.ok === false) throw new Error(`Cadence refused: ${snap.error}`)
	const counts = LIST_KEYS.map((k) => `${k}=${Array.isArray(snap[k]) ? snap[k].length : 'absent'}`).join(' ')
	console.log(`  ${snap.page?.title || 'app-wide page'} — ${counts}`)

	const self = makeFakeSelf(snap, { port: PORT })
	self.config.host = HOST
	self.config.scope = SCOPE

	console.log('\nDefinitions built from the live snapshot:')
	initVariables(self)
	updateVariables(self)
	setActions(self)
	setFeedbacks(self)
	setPresets(self)
	assert(Object.keys(self._actions).length >= 20, `${Object.keys(self._actions).length} actions`)
	assert(Object.keys(self._feedbacks).length >= 15, `${Object.keys(self._feedbacks).length} feedbacks`)
	assert(self._varDefs.length >= 7, `${self._varDefs.length} variables`)
	console.log(`  • ${Object.keys(self._presets).length} presets`)
	const unvalued = self._varDefs.filter((d) => !(d.variableId in self._varValues))
	assert(
		unvalued.length === 0,
		`every variable has a value${unvalued.length ? ` (missing: ${unvalued.map((d) => d.variableId).join(', ')})` : ''}`,
	)

	console.log('\nFeedbacks evaluate against live state without throwing:')
	let evaluated = 0
	for (const [id, f] of Object.entries(self._feedbacks)) {
		const opts = {}
		for (const o of f.options) if ('default' in o) opts[o.id] = o.default
		try {
			f.callback({ feedbackId: id, options: opts })
			evaluated++
		} catch (e) {
			assert(false, `feedback ${id} threw: ${e.message}`)
		}
	}
	assert(evaluated === Object.keys(self._feedbacks).length, `${evaluated} feedbacks evaluated`)

	for (const t of self.timers().slice(0, 3))
		console.log(`  timer "${t.name}": ${t.primary} (${t.mood}${t.running ? ', running' : ''})`)
	for (const p of self.state.polls)
		console.log(`  poll "${p.name}": ${p.state}, ${p.total} votes, Q${p.index}/${p.count}`)

	console.log('\nCommand path (harmless — malformed, must be rejected):')
	const bad = await (
		await fetch(`${BASE}${EP.command}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'start' }),
		})
	).json()
	assert(bad.ok === false, `malformed command rejected gracefully (error: "${bad.error ?? '—'}")`)

	console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`)
	process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
	console.error('harness error:', e)
	process.exit(2)
})
