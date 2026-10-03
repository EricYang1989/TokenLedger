/**
 * Multi-source sync host-side helper — runs every usage bridge once.
 *
 * The panel's sync button POSTs to `/api/tokenledger/sync-zcode` (loopback
 * only). This module is what that route calls: it spawns each bridge script
 * (ZCode's sqlite ledger, Codex's session rollouts, Claude Code's
 * transcripts), waits for all, and returns a combined summary. Bridges and
 * this call site are the only pieces that know about foreign apps' local
 * databases — everything else in the package reads only DSH session logs.
 *
 * @module dsh-tokenledger/zcode-bridge
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

/** Every usage bridge, run in order on one button press. */
/** Every usage bridge, run in order on one button press. */
const BRIDGES = [
	join(homedir(), "deepseek", "config", "zcode-usage-bridge", "bridge.mjs"),
	join(homedir(), "deepseek", "config", "zcode-usage-bridge", "codex-bridge.mjs"),
	join(homedir(), "deepseek", "config", "zcode-usage-bridge", "claude-bridge.mjs"),
	join(homedir(), "deepseek", "config", "zcode-usage-bridge", "minimax-bridge.mjs")
];

function runOne(script) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [script], {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env }
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (c) => {
			stdout += String(c);
		});
		child.stderr.on("data", (c) => {
			stderr += String(c);
		});
		child.on("error", (error) => reject(error));
		child.on("close", (code) => {
			if (code !== 0) reject(new Error(`${script} exited ${code}: ${stderr.trim() || stdout.trim()}`));
			else resolve(stdout);
		});
	});
}

/**
 * Run every bridge once and merge the tallies.
 *
 * One source failing must not hide the other's fresh rows, so failures are
 * collected into `errors` while whatever succeeded still counts.
 *
 * @returns `{ ok, appended, written, errors }`.
 */
export async function runBridgeSync() {
	const outs = [];
	const errors = [];
	for (const script of BRIDGES) {
		try {
			outs.push(await runOne(script));
		} catch (error) {
			errors.push(error?.message ?? String(error));
		}
	}
	const stdout = outs.join("\n");
	const appended = [...stdout.matchAll(/appended (\d+) usage row\(s\)/g)].reduce(
		(sum, m) => sum + Number(m[1]),
		0
	);
	const result = { ok: errors.length === 0, appended, written: stdout.trim() };
	if (errors.length > 0) result.errors = errors;
	return result;
}
