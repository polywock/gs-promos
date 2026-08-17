#!/usr/bin/env node
// Commits, pushes, then waits until GitHub Pages actually serves the new bytes.
// Usage: node release.js [commit message]

const { execFileSync } = require("node:child_process")
const { readFileSync } = require("node:fs")
const { resolve } = require("node:path")

const FILE = "config.json"
const URL = "https://polywock.github.io/gs-promos/config.json"
const ATTEMPTS = 40
const DELAY = 5000

const path = resolve(__dirname, FILE)
const message = process.argv[2] || "update"

const git = (...args) => execFileSync("git", args, { cwd: __dirname, encoding: "utf8" })
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

function fail(msg) {
	console.error(`FAIL: ${msg}`)
	process.exit(1)
}

async function main() {
	const local = readFileSync(path, "utf8")

	// Malformed JSON is dropped silently by the extension's sanitizer, so catch it here instead.
	try {
		JSON.parse(local)
	} catch (err) {
		fail(`${FILE} is not valid JSON — ${err.message}`)
	}

	if (git("status", "--porcelain").trim()) {
		git("add", "-A")
		git("commit", "-m", message)
		console.log(`Committed "${message}".`)
	} else {
		console.log("Nothing to commit, waiting on current HEAD.")
	}

	git("push")
	console.log(`Pushed. Waiting for Pages to deploy and serve ${FILE}...`)

	// The plain URL is what the extension hits, so no cache buster: this measures what users get.
	let status = 0
	let served = ""

	for (let i = 1; i <= ATTEMPTS; i++) {
		await sleep(DELAY)

		try {
			const resp = await fetch(URL, { cache: "no-store" })
			status = resp.status
			served = await resp.text()
		} catch (err) {
			status = 0
			served = ""
		}

		if (status === 200 && served === local) {
			console.log(`PASS: Pages serving current ${FILE} (after ${(i * DELAY) / 1000}s)`)
			return
		}
		console.log(`  attempt ${i}/${ATTEMPTS}: HTTP ${status || "error"}, still stale`)
	}

	if (status === 404) {
		fail("404 the whole time. Is Pages enabled? Settings > Pages > Deploy from branch: main /(root)")
	}

	console.error(`--- served ---\n${served}\n--- local ---\n${local}`)
	fail(`Pages still stale after ${(ATTEMPTS * DELAY) / 1000}s`)
}

main().catch((err) => fail(err.message))
