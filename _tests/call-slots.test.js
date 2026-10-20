// Tests for js/call-slots.js, the slot arithmetic behind the call scheduler on the
// contact pages. A bug here raises no error: visitors are simply offered times we
// cannot do (a holiday, lunch, an hour off after a clock change). Each test pins
// "now" and checks the slots against Berlin wall-clock times computed independently
// with Intl, so it does not trust the code under test to check itself.
//
// Run from the repo root (Node 20+, no dependencies): node --test _tests/
'use strict';

// Visitor-day grouping uses the process time zone; pin it so results are repeatable.
process.env.TZ = 'Europe/Berlin';

const test = require('node:test');
const assert = require('node:assert/strict');
const slots = require('../js/call-slots.js');

const berlinParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

// Berlin wall clock of an instant: { date: '2026-10-14', time: '09:00', weekday: 'Wed', minutes: 540 }.
function berlin(ts) {
    const p = Object.fromEntries(berlinParts.formatToParts(new Date(ts)).map((part) => [part.type, part.value]));
    return {
        date: `${p.year}-${p.month}-${p.day}`,
        time: `${p.hour}:${p.minute}`,
        weekday: p.weekday,
        minutes: Number(p.hour) * 60 + Number(p.minute),
    };
}

function allSlots(now) {
    return [...slots.buildSlots(now).values()].flat().sort((a, b) => a - b);
}

function slotsOn(now, berlinDate) {
    return allSlots(now).filter((ts) => berlin(ts).date === berlinDate);
}

const at = (iso) => Date.parse(iso);

test('closes nationwide holidays and 24 and 31 December, with Easter computed per year', () => {
    const easterBased = {
        2024: ['2024-03-29', '2024-04-01', '2024-05-09', '2024-05-20'],
        2025: ['2025-04-18', '2025-04-21', '2025-05-29', '2025-06-09'],
        2026: ['2026-04-03', '2026-04-06', '2026-05-14', '2026-05-25'],
        2027: ['2027-03-26', '2027-03-29', '2027-05-06', '2027-05-17'],
    };
    for (const [year, days] of Object.entries(easterBased)) {
        const closed = slots.closedDays(Number(year));
        const fixed = ['01-01', '05-01', '10-03', '12-24', '12-25', '12-26', '12-31'].map((d) => `${year}-${d}`);
        assert.deepEqual([...closed].sort(), [...fixed, ...days].sort(), `holidays ${year}`);
    }
});

test('offers 14 slots a day, 09:00 to 16:30 every 30 minutes, none touching lunch', () => {
    const now = at('2026-10-12T08:00:00Z'); // Monday 10:00 in Berlin
    const times = slotsOn(now, '2026-10-14').map((ts) => berlin(ts).time);
    assert.deepEqual(times, [
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    ]);
    for (const ts of allSlots(now)) {
        const start = berlin(ts).minutes;
        assert.ok(!(start < 13 * 60 && start + slots.OFFICE.duration > 12 * 60), `slot at ${berlin(ts).time} overlaps lunch`);
    }
});

test('never offers a weekend or a closed day', () => {
    for (const now of [at('2026-10-12T08:00:00Z'), at('2026-12-21T08:00:00Z'), at('2027-03-20T09:00:00Z')]) {
        const year = new Date(now).getUTCFullYear();
        const closed = new Set([...slots.closedDays(year), ...slots.closedDays(year + 1)]);
        for (const ts of allSlots(now)) {
            const { date, weekday } = berlin(ts);
            assert.ok(weekday !== 'Sat' && weekday !== 'Sun', `${date} is a weekend`);
            assert.ok(!closed.has(date), `${date} is closed`);
        }
    }
});

test('tomorrow can be booked until 17:30 Berlin time today', () => {
    const first = (now) => berlin(allSlots(now)[0]);
    // Wednesday 14 October 2026; Berlin is UTC+2 (summer time).
    assert.deepEqual(first(at('2026-10-14T15:29:00Z')), { date: '2026-10-15', time: '09:00', weekday: 'Thu', minutes: 540 });
    assert.equal(first(at('2026-10-14T15:30:00Z')).date, '2026-10-16');
    // After the cutoff on Friday, Monday is still open: the weekend comes in between.
    assert.equal(first(at('2026-10-16T16:00:00Z')).date, '2026-10-19');
    // On Sunday the cutoff applies to Monday.
    assert.equal(first(at('2026-10-18T15:00:00Z')).date, '2026-10-19');
    assert.equal(first(at('2026-10-18T16:00:00Z')).date, '2026-10-20');
});

test('offers slots up to 42 days ahead and no further', () => {
    const now = at('2026-10-12T08:00:00Z'); // Monday 12 October; day 42 is Monday 23 November
    const last = berlin(allSlots(now).at(-1));
    assert.equal(last.date, '2026-11-23');
    assert.equal(last.time, '16:30');
});

test('keeps Berlin office hours across the clock changes', () => {
    // Autumn 2026: summer time ends on Sunday 25 October.
    const autumn = at('2026-10-19T08:00:00Z');
    assert.equal(new Date(slotsOn(autumn, '2026-10-23')[0]).toISOString(), '2026-10-23T07:00:00.000Z');
    assert.equal(new Date(slotsOn(autumn, '2026-10-26')[0]).toISOString(), '2026-10-26T08:00:00.000Z');
    // Spring 2027: summer time starts on Sunday 28 March, between Good Friday and Easter Monday.
    const spring = at('2027-03-20T09:00:00Z');
    assert.equal(new Date(slotsOn(spring, '2027-03-25')[0]).toISOString(), '2027-03-25T08:00:00.000Z');
    assert.deepEqual(slotsOn(spring, '2027-03-26'), [], 'Good Friday');
    assert.deepEqual(slotsOn(spring, '2027-03-29'), [], 'Easter Monday');
    assert.equal(new Date(slotsOn(spring, '2027-03-30')[0]).toISOString(), '2027-03-30T07:00:00.000Z');
});

test('crosses the year boundary with both years\' holidays closed', () => {
    const now = at('2026-12-21T08:00:00Z');
    const days = new Set(allSlots(now).map((ts) => berlin(ts).date));
    for (const closed of ['2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01']) assert.ok(!days.has(closed), closed);
    for (const open of ['2026-12-22', '2026-12-28', '2027-01-04']) assert.ok(days.has(open), open);
});

test('groups slots by the visitor\'s own calendar day', () => {
    const now = at('2026-10-12T08:00:00Z');
    process.env.TZ = 'Pacific/Auckland'; // UTC+13 in October
    try {
        const byDay = slots.buildSlots(now);
        // Wednesday 09:00 in Berlin is 20:00 the same day in Auckland; 16:30 is 03:30 on Thursday.
        assert.ok(byDay.get('2026-10-14').includes(at('2026-10-14T07:00:00Z')));
        assert.ok(byDay.get('2026-10-15').includes(at('2026-10-14T14:30:00Z')));
        const total = [...byDay.values()].reduce((sum, list) => sum + list.length, 0);
        assert.equal(total, allSlots(now).length, 'every slot lands in exactly one day');
    } finally {
        process.env.TZ = 'Europe/Berlin';
    }
});
