const { Regex } = require('@companion-module/base')

function GetConfigFields() {
	return [
		{
			type: 'static-text',
			id: 'cadence',
			width: 12,
			label: 'LiveLogix Cadence',
			value:
				'Cadence is the countdown clock and show timer for Mac: design a clock once and show it on displays, the web, NDI, SDI, vMix and wall clocks, all on one synced time, plus audience polls, run-of-show schedules from a Google Sheet, and Planning Center Services LIVE. Free beta, everything unlocked: https://cadence.livelogix.app',
		},
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'About',
			value:
				'Connects to Cadence over your LAN. "Whole show" controls every timer, message, scene, schedule, poll and more in the show (Cadence’s app port, default 8730). "One Producer page" limits Companion to what’s wired onto that Producer node — use its port.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Cadence Host (IP address)',
			width: 8,
			default: '127.0.0.1',
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			default: 8730,
			min: 1,
			max: 65535,
		},
		{
			type: 'dropdown',
			id: 'scope',
			label: 'Control scope',
			width: 12,
			default: 'show',
			choices: [
				{ id: 'show', label: 'Whole show — everything in Cadence’s editor (app port, 8730)' },
				{ id: 'page', label: 'One Producer page — only what’s wired onto it (that node’s port)' },
			],
		},
		{
			type: 'number',
			id: 'poll',
			label: 'Poll interval (ms) — how often to refresh live time',
			width: 6,
			default: 250,
			min: 100,
			max: 10000,
		},
	]
}

module.exports = { GetConfigFields }
