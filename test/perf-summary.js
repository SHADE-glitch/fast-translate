#!/usr/bin/env node
// test/perf-summary.js — human-readable summary of a perf-probe.js artifact.
//
// Kept in its own file on purpose: the probe runs inside
// `dbus-run-session bash -c '...'`, and an inline `node -e '...'` there breaks
// on the first single quote in the JS. Same reason the probe itself is read from
// disk by the shell rather than passed through gdbus.
//
// ESM, not CommonJS: package.json sets "type": "module", so a .js file in this
// repo has no `require`.
//
//   node test/perf-summary.js ~/.cache/fast-translate-perf/latest-all.json
import {readFileSync} from 'node:fs';

const path = process.argv[2];
if (!path) {
    console.error('usage: perf-summary.js <result.json>');
    process.exit(2);
}

const r = JSON.parse(readFileSync(path, 'utf8'));

if (r.errors && r.errors.length)
    console.log('PROBE ERRORS: ' + r.errors.join(' | '));

if (r.cost && r.cost.timings && r.cost.timings.length) {
    console.log('--- cost (1 tick = 10 ms of main-thread CPU) ---');
    for (const t of r.cost.timings) {
        const parts = [];
        if (t.ticks !== undefined)
            parts.push(t.ticks + ' ticks');
        if (t.us !== undefined)
            parts.push((t.us / 1000).toFixed(1) + ' ms wall');
        if (t.perInstanceUs !== undefined)
            parts.push(t.perInstanceUs + ' us/window');
        if (t.mapSize !== undefined)
            parts.push('map=' + t.mapSize + ', chars=' + t.totalChars);
        if (t.deltaKB !== undefined)
            parts.push('+' + t.deltaKB + ' KB');
        if (t.heldRss !== undefined)
            parts.push('held ' + t.heldRss + ' -> released ' + t.afterReleaseRssKB + ' KB');
        console.log('  ' + t.label.padEnd(34) + parts.join(', '));
    }
}

if (r.cost && r.cost.samples && r.cost.samples.length) {
    console.log('--- memory after gc ---');
    for (const s of r.cost.samples)
        console.log('  ' + s.tag.padEnd(42) + s.rssKB + ' KB');
}

if (r.idle && r.idle.windows && r.idle.windows.length) {
    console.log('--- idle CPU, alternating 30 s windows ---');
    for (const w of r.idle.windows) {
        // A window whose requested state never materialised measures the wrong
        // thing, so say so next to the number instead of silently averaging it in.
        console.log('  ' + w.state.padEnd(9) + String(w.cpuTicks).padStart(4)
            + ' ticks  ' + String(w.cpuPctOfOneCore).padStart(6) + ' % of one core'
            + (w.stateReached === false ? '   (STATE NOT REACHED — ignore)' : ''));
    }
    const on = r.idle.windows.filter(w => w.state === 'enabled').map(w => w.cpuTicks);
    const off = r.idle.windows.filter(w => w.state === 'disabled').map(w => w.cpuTicks);
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const spread = Math.max(...on) - Math.min(...on);
    const delta = avg(on) - avg(off);
    console.log('  enabled avg ' + avg(on).toFixed(1) + ', disabled avg ' + avg(off).toFixed(1)
        + ', delta ' + delta.toFixed(1) + ', in-group spread ' + spread);
    // The claim that matters: an enabled-minus-disabled delta that does not
    // exceed the spread inside the enabled state is not a measurement.
    console.log('  => ' + (Math.abs(delta) <= spread
        ? 'idle cost is below the noise floor (not measurable)'
        : 'idle cost exceeds the noise: ' + delta.toFixed(1) + ' ticks per 30 s'));
    if (r.idle.baseRssAfterGcKB && r.idle.enabledRssAfterGcKB) {
        console.log('  RSS after gc: unloaded ' + r.idle.baseRssAfterGcKB
            + ' KB, enabled ' + r.idle.enabledRssAfterGcKB + ' KB, delta '
            + (r.idle.enabledRssAfterGcKB - r.idle.baseRssAfterGcKB) + ' KB');
    }
}
