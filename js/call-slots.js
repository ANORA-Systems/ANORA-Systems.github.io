// Office hours, public holidays and slot times for the call scheduler
// (js/call-scheduler.js). No page code here, so _tests/call-slots.test.js can
// run it under Node without a browser. The contact pages load this file first;
// it puts its functions on window.AnoraCallSlots (module.exports under Node).
(function (root) {
    'use strict';

    const DAY = 86400000;
    // Times are minutes after midnight in OFFICE.timeZone. The texts in
    // js/call-scheduler.js say "20 minutes" and "9 to 17", so change them
    // together with these values.
    const OFFICE = {
        timeZone: 'Europe/Berlin',
        firstStart: 9 * 60,
        lastStart: 16 * 60 + 30,
        step: 30,
        duration: 20,
        lunch: [12 * 60, 13 * 60],  // no call may overlap this
        cutoff: 17 * 60 + 30,       // tomorrow can be booked until this time today
        daysAhead: 42,
    };

    const fmtOffice = new Intl.DateTimeFormat('en-US', {
        timeZone: OFFICE.timeZone, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });

    function pad(n) { return String(n).padStart(2, '0'); }

    // Calendar day in the visitor's time zone, e.g. "2026-10-14".
    function dayKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
    function keyDate(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
    function utcKey(ts) { return new Date(ts).toISOString().slice(0, 10); }

    // Wall-clock fields of an instant in the office time zone.
    function officeClock(ts) {
        const parts = {};
        fmtOffice.formatToParts(new Date(ts)).forEach((part) => { parts[part.type] = Number(part.value); });
        parts.hour %= 24;
        return parts;
    }

    // Milliseconds the office clock is ahead of UTC at an instant.
    function officeOffset(ts) {
        const c = officeClock(ts);
        return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - (ts - (ts % 1000));
    }

    // UTC instant of a wall-clock time (minutes after midnight) in the office time zone.
    function officeTime(year, month, day, minutes) {
        const wall = Date.UTC(year, month, day, 0, minutes);
        return wall - officeOffset(wall - officeOffset(wall));
    }

    // No calls on nationwide public holidays in Germany or on 24 and 31 December.
    function closedDays(year) {
        // Easter Sunday, anonymous Gregorian algorithm.
        const a = year % 19, b = Math.floor(year / 100), c = year % 100;
        const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        const easter = Date.UTC(year, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
        const fixed = [[0, 1], [4, 1], [9, 3], [11, 24], [11, 25], [11, 26], [11, 31]]
            .map(([month, day]) => utcKey(Date.UTC(year, month, day)));
        // Good Friday, Easter Monday, Ascension Day, Whit Monday.
        return fixed.concat([-2, 1, 39, 50].map((offset) => utcKey(easter + offset * DAY)));
    }

    // Slot start times from the next office day on, grouped by the visitor's calendar day.
    // `now` is a parameter so tests can pin the clock; the page passes nothing.
    function buildSlots(now = Date.now()) {
        const today = officeClock(now);
        const closed = new Set(closedDays(today.year).concat(closedDays(today.year + 1)));
        const first = today.hour * 60 + today.minute < OFFICE.cutoff ? 1 : 2;
        const byDay = new Map();
        for (let i = first; i <= OFFICE.daysAhead; i++) {
            const date = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
            const weekday = date.getUTCDay();
            if (weekday === 0 || weekday === 6 || closed.has(utcKey(date.getTime()))) continue;
            for (let minutes = OFFICE.firstStart; minutes <= OFFICE.lastStart; minutes += OFFICE.step) {
                if (minutes < OFFICE.lunch[1] && minutes + OFFICE.duration > OFFICE.lunch[0]) continue;
                const start = officeTime(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), minutes);
                const key = dayKey(new Date(start));
                if (!byDay.has(key)) byDay.set(key, []);
                byDay.get(key).push(start);
            }
        }
        return byDay;
    }

    const api = { DAY, OFFICE, dayKey, keyDate, utcKey, officeClock, officeOffset, officeTime, closedDays, buildSlots };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AnoraCallSlots = api;
})(typeof window !== 'undefined' ? window : globalThis);
