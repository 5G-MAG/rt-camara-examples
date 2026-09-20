/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

One polling utility for every stage (Network status, Access/device status,
Quick Booking's network+access) — replaces the 3 near-duplicate timers the
original single-file app had (scheduleAutoRefresh / startAccessRefresh /
homeStartPolling).
*/

/**
 * @param {() => Promise<'fast'|'slow'|'stop'>} tick  Fetches+renders once,
 *   returns the pace to use for the *next* tick: 'fast' while the resource
 *   is still transitioning or near an expiry threshold, 'slow' once stable
 *   but still worth watching (e.g. ACTIVATED, waiting on natural expiry),
 *   'stop' once nothing will ever change again (e.g. TERMINATED, or every
 *   device settled GRANTED/DENIED).
 * @param {{fastMs?: number, slowMs?: number}} opts
 * @returns {{stop(): void}}
 */
export function startPolling(tick, { fastMs = 5000, slowMs = 30000 } = {}) {
  let timer = null;
  let stopped = false;

  async function run() {
    if (stopped) return;
    let pace = 'slow';
    try {
      pace = await tick();
    } catch (_) {
      pace = 'fast'; // transient network error — retry soon rather than going quiet
    }
    if (stopped || pace === 'stop') return;
    timer = setTimeout(run, pace === 'fast' ? fastMs : slowMs);
  }

  timer = setTimeout(run, fastMs);
  return { stop() { stopped = true; clearTimeout(timer); } };
}
