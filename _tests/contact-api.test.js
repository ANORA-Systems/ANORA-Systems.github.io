// Tests for js/contact-api.js, the sending behind the contact form and the call
// scheduler. When the hourly limit is used up, the backend answers 429 with a
// Retry-After header; the page turns it into a countdown on the send button. A
// bug here either hides that the visitor may send again or invents a wait the
// backend never asked for.
//
// Run from the repo root (Node 20+, no dependencies): node --test
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../js/contact-api.js');

// The wait lives at module level, as it does once per page. The wait tests
// each load their own copy, so one that fails half way cannot leave a running
// wait or its listeners to the next.
function freshApi() {
    const path = require.resolve('../js/contact-api.js');
    delete require.cache[path];
    const copy = require(path);
    delete require.cache[path];
    return copy;
}

test('Retry-After: whole seconds are read', () => {
    assert.equal(api.retryAfterSeconds('1260'), 1260);
    assert.equal(api.retryAfterSeconds(' 59 '), 59);
    assert.equal(api.retryAfterSeconds('1'), 1);
});

test('Retry-After: missing, zero or unreadable values give no wait', () => {
    for (const value of [null, undefined, '', '0', '-5', '12.5', '1e3', 'abc', '20 minutes',
        'Wed, 21 Oct 2026 07:28:00 GMT', '99999999999999999999']) {
        assert.equal(api.retryAfterSeconds(value), null, `value ${JSON.stringify(value)}`);
    }
});

test('clock: m:ss with seconds padded and fractions rounded up', () => {
    assert.equal(api.clock(1260), '21:00');
    assert.equal(api.clock(1259), '20:59');
    assert.equal(api.clock(3600), '60:00');
    assert.equal(api.clock(61), '1:01');
    assert.equal(api.clock(59), '0:59');
    assert.equal(api.clock(0.2), '0:01');
    assert.equal(api.clock(0), '0:00');
});

// Builds a fetch stand-in that answers with the given status and headers.
function fakeFetch(status, headers = {}) {
    const calls = [];
    const fn = async (url, options) => {
        calls.push({ url, options });
        return {
            ok: status >= 200 && status < 300,
            status,
            headers: { get: (name) => headers[name.toLowerCase()] ?? null },
        };
    };
    fn.calls = calls;
    return fn;
}

async function withFetch(fn, body) {
    const saved = globalThis.fetch;
    globalThis.fetch = fn;
    try {
        return await body();
    } finally {
        globalThis.fetch = saved;
    }
}

const message = { subject: 'Message from Jane Doe', message: 'Hello', senderEmail: 'jane@example.com', website: '' };

test('send: posts the body the backend expects', async () => {
    const fetch = fakeFetch(204);
    const result = await withFetch(fetch, () => api.send({ ...message, subject: 'x'.repeat(250), website: undefined }));
    assert.deepEqual(result, { status: 'sent' });
    assert.equal(fetch.calls.length, 1);
    assert.equal(fetch.calls[0].url, api.ENDPOINT);
    assert.equal(fetch.calls[0].options.method, 'POST');
    assert.deepEqual(fetch.calls[0].options.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(fetch.calls[0].options.body), {
        subject: 'x'.repeat(200), message: 'Hello', sender_email: 'jane@example.com', website: '',
    });
});

test('send: 429 with Retry-After gives busy with the wait', async () => {
    const result = await withFetch(fakeFetch(429, { 'retry-after': '1260' }), () => api.send(message));
    assert.deepEqual(result, { status: 'busy', retryAfter: 1260 });
});

test('send: 429 without a readable Retry-After gives busy without a wait', async () => {
    assert.deepEqual(await withFetch(fakeFetch(429), () => api.send(message)), { status: 'busy', retryAfter: null });
    assert.deepEqual(await withFetch(fakeFetch(429, { 'retry-after': 'soon' }), () => api.send(message)),
        { status: 'busy', retryAfter: null });
});

test('send: other errors and network failures give failed', async () => {
    assert.deepEqual(await withFetch(fakeFetch(503, { 'retry-after': '60' }), () => api.send(message)), { status: 'failed' });
    assert.deepEqual(await withFetch(fakeFetch(403), () => api.send(message)), { status: 'failed' });
    const offline = async () => { throw new TypeError('Failed to fetch'); };
    assert.deepEqual(await withFetch(offline, () => api.send(message)), { status: 'failed' });
});

test('countdown: ticks against the clock and ends once at zero', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    let now = 1_000_000;
    const ticks = [];
    let done = 0;
    api.countdown(3, (left) => ticks.push(left), () => { done += 1; }, () => now);
    assert.deepEqual(ticks, [3]);
    now += 1000; t.mock.timers.tick(1000);
    now += 1000; t.mock.timers.tick(1000);
    assert.deepEqual(ticks, [3, 2, 1]);
    assert.equal(done, 0);
    now += 1000; t.mock.timers.tick(1000);
    now += 1000; t.mock.timers.tick(1000);
    assert.deepEqual(ticks, [3, 2, 1]);
    assert.equal(done, 1);
});

test('countdown: a tab woken after a long sleep ends at once, not after the missed seconds', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    let now = 0;
    const ticks = [];
    let done = 0;
    api.countdown(60, (left) => ticks.push(left), () => { done += 1; }, () => now);
    now += 90_000; t.mock.timers.tick(1000);
    assert.deepEqual(ticks, [60]);
    assert.equal(done, 1);
});

test('countdown: stopping it calls neither tick nor done again', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    let now = 0;
    let ticks = 0;
    let done = 0;
    const stop = api.countdown(2, () => { ticks += 1; }, () => { done += 1; }, () => now);
    stop();
    now += 5000; t.mock.timers.tick(5000);
    assert.equal(ticks, 1);
    assert.equal(done, 0);
});

test('send: a request still open after 20 seconds is given up and counts as failed', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    // Like the browser's fetch: rejects once the signal aborts.
    const hanging = (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    const pending = withFetch(hanging, () => api.send(message));
    t.mock.timers.tick(19_999);
    let settled = false;
    pending.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);
    t.mock.timers.tick(1);
    assert.deepEqual(await pending, { status: 'failed' });
});

test('countdown: a wait of zero ends on the next turn, after countdown() has returned', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const order = [];
    const stop = api.countdown(0, () => order.push('tick'), () => order.push('done'), () => 0);
    order.push('returned');
    t.mock.timers.tick(0);
    assert.deepEqual(order, ['returned', 'done']);
    stop();
});

// A stand-in for a send button: only what holdButton touches.
function fakeButton(html) {
    const attrs = {};
    return {
        innerHTML: html,
        setAttribute: (name, value) => { attrs[name] = value; },
        removeAttribute: (name) => { delete attrs[name]; },
        attr: (name) => attrs[name],
    };
}

test('wait: both forms follow one wait, and a form opened during it joins', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
    const api = freshApi();
    const form = fakeButton('Send message');
    const events = [];
    const stops = [
        api.holdButton(form, (time) => `Send again in ${time}`, () => 'Send message').stop,
        api.onWait({ start: () => events.push('start'), tick: (left) => events.push(left), done: () => events.push('done') }),
    ];
    assert.equal(api.waiting(), false);
    api.startWait(3);
    assert.equal(api.waiting(), true);
    assert.equal(form.attr('aria-disabled'), 'true');
    assert.match(form.innerHTML, /Send again in <span class="tabular-nums">0:03<\/span>/);
    t.mock.timers.tick(1000);
    const late = fakeButton('Send request');
    stops.push(api.holdButton(late, (time) => `Send again in ${time}`, () => 'Send request').stop);
    assert.equal(late.attr('aria-disabled'), 'true');
    assert.match(late.innerHTML, /0:02/);
    t.mock.timers.tick(1000);
    t.mock.timers.tick(1000);
    assert.equal(api.waiting(), false);
    assert.deepEqual(events, ['start', 3, 2, 1, 'done']);
    for (const [button, idle] of [[form, 'Send message'], [late, 'Send request']]) {
        assert.equal(button.attr('aria-disabled'), undefined);
        assert.equal(button.innerHTML, idle);
    }
    stops.forEach((stop) => stop());
});

test('wait: a new 429 during the wait restarts it with the newer time', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
    const api = freshApi();
    const events = [];
    const stop = api.onWait({ start: () => events.push('start'), tick: (left) => events.push(left), done: () => events.push('done') });
    api.startWait(5);
    t.mock.timers.tick(1000);
    api.startWait(2);
    // One second at a time: within one tick() the mocked Date jumps to its end first.
    t.mock.timers.tick(1000);
    t.mock.timers.tick(1000);
    assert.deepEqual(events, ['start', 5, 4, 'start', 2, 1, 'done']);
    assert.equal(api.waiting(), false);
    stop();
});

test('wait: zero or a missing time starts no wait', () => {
    const api = freshApi();
    let calls = 0;
    const stop = api.onWait({ start: () => { calls += 1; }, tick: () => {}, done: () => {} });
    api.startWait(0);
    api.startWait(null);
    assert.equal(api.waiting(), false);
    assert.equal(calls, 0);
    stop();
});

test('wait: a form whose own request ends during the wait gets the time back on its button', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
    const api = freshApi();
    const button = fakeButton('Send message');
    const hold = api.holdButton(button, (time) => `Send again in ${time}`, () => 'Send message');
    hold.refresh();
    assert.equal(button.innerHTML, 'Send message', 'no wait: refresh leaves the button alone');
    api.startWait(90);
    button.innerHTML = 'Send message';
    hold.refresh();
    assert.match(button.innerHTML, /1:30/);
    assert.equal(button.attr('aria-disabled'), 'true');
    hold.stop();
});

test('announce: the text is set a moment after the region is emptied, so a repeat is read again', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const region = { textContent: 'You can send your message again now.' };
    api.announce(region, 'You can send your message again now.');
    assert.equal(region.textContent, '');
    t.mock.timers.tick(50);
    assert.equal(region.textContent, 'You can send your message again now.');
});

test('wait: when it ends, the button gets what the form says it should show now', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
    const api = freshApi();
    const button = fakeButton('Send message');
    let sending = false;
    const hold = api.holdButton(button, (time) => `Send again in ${time}`, () => (sending ? 'Sending' : 'Send message'));
    api.startWait(1);
    sending = true;
    t.mock.timers.tick(1000);
    assert.equal(button.innerHTML, 'Sending', 'a request still open keeps its sending label');
    assert.equal(button.attr('aria-disabled'), undefined);
    hold.stop();
});

test('keepMailtoCurrent: every way to reach the link rebuilds its href from the form', () => {
    const handlers = {};
    const link = { href: 'mailto:info@anora-systems.com', addEventListener: (type, fn) => { handlers[type] = fn; } };
    let text = 'first';
    api.keepMailtoCurrent(link, () => `mailto:info@anora-systems.com?body=${text}`);
    for (const type of ['pointerenter', 'focus', 'pointerdown', 'contextmenu', 'click']) {
        text = type;
        handlers[type]();
        assert.equal(link.href, `mailto:info@anora-systems.com?body=${type}`, type);
    }
});
