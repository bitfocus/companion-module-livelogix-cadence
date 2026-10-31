// Real control round-trip against a live Cadence timer, using the exact wire
// commands the Companion module sends. Reads /api/state between each step and
// asserts the expected change, then restores a clean state.
const PORT = process.argv[2] || 8730
const CLOCK = process.argv[3] || 'timer-84FF'
const BASE = `http://127.0.0.1:${PORT}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function state() {
	const d = await (await fetch(`${BASE}/api/state`)).json()
	return d.clocks.find((c) => c.id === CLOCK)
}
async function cmd(body) {
	const r = await (
		await fetch(`${BASE}/api/command`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
	).json()
	return r
}

let fails = 0
function check(cond, msg) {
	console.log(`  ${cond ? '✓' : '✗'} ${msg}`)
	if (!cond) fails++
}

async function main() {
	const orig = await state()
	console.log(`Target: ${orig.name} (${CLOCK}) on ${BASE}`)
	console.log(`Original: running=${orig.running} remaining=${Math.round(orig.remaining)} duration=${orig.duration}\n`)

	// 1) Set duration to 2:00
	console.log('1) setDuration 120')
	let ack = await cmd({ action: 'setDuration', clock: CLOCK, seconds: 120 })
	check(ack.ok === true, `ack ok (${JSON.stringify(ack)})`)
	await sleep(150)
	let s = await state()
	check(s.duration === 120, `duration is 120 (got ${s.duration})`)
	check(Math.round(s.remaining) === 120, `remaining reset to 120 (got ${Math.round(s.remaining)})`)
	check(s.running === false, `not running after setDuration (got ${s.running})`)

	// 2) Start, confirm it counts
	console.log('\n2) start, then observe it counting')
	check((await cmd({ action: 'start', clock: CLOCK })).ok === true, 'start ack ok')
	await sleep(150)
	const r1 = (await state()).remaining
	await sleep(1100)
	const r2 = (await state()).remaining
	check((await state()).running === true, 'running is true')
	check(r2 < r1, `remaining decreased while running (${Math.round(r1)} -> ${Math.round(r2)})`)

	// 3) Pause, confirm it holds
	console.log('\n3) pause, then confirm it holds')
	check((await cmd({ action: 'pause', clock: CLOCK })).ok === true, 'pause ack ok')
	await sleep(150)
	const p1 = (await state()).remaining
	await sleep(800)
	const p2 = (await state()).remaining
	check((await state()).running === false, 'running is false after pause')
	check(Math.abs(p2 - p1) < 0.2, `remaining held while paused (${Math.round(p1)} ~= ${Math.round(p2)})`)

	// 4) Adjust +30
	console.log('\n4) adjust +30')
	const beforeAdj = (await state()).remaining
	check((await cmd({ action: 'adjust', clock: CLOCK, seconds: 30 })).ok === true, 'adjust ack ok')
	await sleep(150)
	const afterAdj = (await state()).remaining
	check(Math.round(afterAdj - beforeAdj) === 30, `remaining +30 (${Math.round(beforeAdj)} -> ${Math.round(afterAdj)})`)

	// 5) Toggle (should start again since paused)
	console.log('\n5) toggle (paused -> running)')
	check((await cmd({ action: 'toggle', clock: CLOCK })).ok === true, 'toggle ack ok')
	await sleep(150)
	check((await state()).running === true, 'running after toggle from paused')

	// 6) Reset
	console.log('\n6) reset')
	check((await cmd({ action: 'reset', clock: CLOCK })).ok === true, 'reset ack ok')
	await sleep(150)
	s = await state()
	check(s.running === false, 'not running after reset')
	check(Math.round(s.remaining) === 120, `remaining back to full 120 (got ${Math.round(s.remaining)})`)

	// Restore original duration; leave cleanly reset (original was expired+running,
	// which isn't meaningfully restorable — a clean reset is the safe end state).
	console.log('\nRestoring original duration (300), left reset/stopped')
	await cmd({ action: 'setDuration', clock: CLOCK, seconds: orig.duration || 300 })
	await sleep(150)
	const fin = await state()
	console.log(`Final: running=${fin.running} remaining=${Math.round(fin.remaining)} duration=${fin.duration}`)

	console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURE(S)'}`)
	process.exit(fails === 0 ? 0 : 1)
}
main().catch((e) => {
	console.error('error:', e)
	process.exit(2)
})
