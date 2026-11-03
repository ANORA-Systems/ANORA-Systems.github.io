// Sending to the SpecScout backend's contact endpoint, shared by the written
// contact form (js/contact-form.js) and the call scheduler
// (js/call-scheduler.js). It reads no page on its own: the few browser helpers
// (holdButton, announce, keepMailtoCurrent) work only on the elements they are given, so
// _tests/contact-api.test.js can run all of it under Node without a browser.
// The contact pages load this file first; it puts its functions on
// window.AnoraContactApi (module.exports under Node).
//
// It also keeps the wait after a 429 for both forms (startWait, onWait,
// holdButton below).
//
// The endpoint mails the message to us with the visitor's address as Reply-To.
// Request body (backend: app/models/pydantic/contact_request.py):
//   {
//     "subject": "Message from Jane Doe",   // one line, max 200 chars; mailed with a "[Contact request]" prefix
//     "message": "...",                     // max 5000 chars
//     "sender_email": "jane@example.com",   // becomes the mail's Reply-To
//     "website": ""                         // honeypot, bots fill it in
//   }
// 204 on success. Errors come as {"detail": "...", "code": "..."}: 403 from a
// foreign origin, 503 when the mail server did not take the message, and 429
// (code contact_request_rate_limit_exceeded) when the per-visitor or the total
// hourly limit is used up. That 429 carries a Retry-After header with the
// seconds until the visitor may send again; the backend exposes it to this
// page through CORS (Access-Control-Expose-Headers).
(function (root) {
    'use strict';

    const ENDPOINT = 'https://api.anora-systems.com/api/v1/contact';
    const SUBJECT_MAX_LENGTH = 200;
    // The backend sends the mail while the request waits.
    const TIMEOUT = 20000;

    // Seconds from a Retry-After value, or null when it is missing, zero or
    // not a whole number. The backend sends only seconds, never the HTTP-date
    // form, so a date counts as unreadable and the page shows its message
    // without a time.
    function retryAfterSeconds(value) {
        const text = String(value == null ? '' : value).trim();
        if (!/^\d+$/.test(text)) return null;
        const seconds = Number(text);
        return seconds > 0 && Number.isSafeInteger(seconds) ? seconds : null;
    }

    // "m:ss" for the countdown on the send button: 1260 -> "21:00", 59 -> "0:59".
    function clock(seconds) {
        const s = Math.max(0, Math.ceil(seconds));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    // POSTs one message. Resolves to { status: 'sent' }, { status: 'busy',
    // retryAfter } (retryAfter in seconds or null) or { status: 'failed' };
    // offline, blocked and timed-out requests count as failed. Never rejects.
    async function send({ subject, message, senderEmail, website }) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT);
        try {
            const response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: subject.slice(0, SUBJECT_MAX_LENGTH),
                    message,
                    sender_email: senderEmail,
                    website: website || '',
                }),
                signal: controller.signal,
            });
            if (response.ok) return { status: 'sent' };
            if (response.status === 429) {
                return { status: 'busy', retryAfter: retryAfterSeconds(response.headers.get('Retry-After')) };
            }
            return { status: 'failed' };
        } catch (error) {
            return { status: 'failed' };
        } finally {
            clearTimeout(timer);
        }
    }

    // Counts down from `seconds`, calling onTick(remainingSeconds) right away
    // and then every second, and onDone() once at zero. Measured against the
    // clock rather than counting ticks, so a tab the browser put to sleep
    // still ends on time. onDone never runs before countdown() has returned,
    // so a caller may keep the returned stop function without a race. Returns
    // a function that stops it without onDone.
    function countdown(seconds, onTick, onDone, now = Date.now) {
        const end = now() + seconds * 1000;
        let timer = null;
        const left = () => Math.ceil((end - now()) / 1000);
        if (left() <= 0) {
            timer = setTimeout(onDone, 0);
            return () => clearTimeout(timer);
        }
        timer = setInterval(() => {
            if (left() > 0) {
                onTick(left());
                return;
            }
            clearInterval(timer);
            onDone();
        }, 1000);
        onTick(left());
        return () => clearInterval(timer);
    }

    // ---- The wait after a 429 ----------------------------------------------
    // The hourly limit applies to the visitor, not to one form, so the wait is
    // kept here once per page: a 429 in the contact form also holds the call
    // scheduler's button, and the other way round. Each form subscribes with
    // onWait() and shows its own message and button.

    let waitStop = null;
    let waitLeft = 0;
    const waitListeners = new Set();

    function waiting() {
        return waitStop !== null;
    }

    // Starts (or restarts) the wait. A second 429 while waiting brings a new
    // Retry-After from the backend, which is the more current one.
    function startWait(seconds) {
        if (!(seconds > 0)) return;
        if (waitStop) waitStop();
        waitStop = null;
        waitListeners.forEach((listener) => listener.start());
        waitStop = countdown(seconds, (left) => {
            waitLeft = left;
            waitListeners.forEach((listener) => listener.tick(left));
        }, () => {
            waitStop = null;
            waitLeft = 0;
            waitListeners.forEach((listener) => listener.done());
        });
    }

    // listener: { start(), tick(secondsLeft), done() }. A listener added
    // during a wait joins it right away. Returns a function that removes it.
    function onWait(listener) {
        waitListeners.add(listener);
        if (waiting()) {
            listener.start();
            listener.tick(waitLeft);
        }
        return () => waitListeners.delete(listener);
    }

    // Holds a send button during the wait: it shows the time left (m:ss) and
    // is marked unavailable with aria-disabled rather than disabled, so it
    // keeps full contrast and stays reachable for screen readers, which read
    // out the time; the form's submit handler ignores it while waiting().
    // label(time) builds the button text around the time; idle() gives the
    // button's markup for when no wait runs, from the form's own state (its
    // "sending" label while a request it sent is still open).
    // Returns { stop, refresh }: refresh() puts the time back after the form
    // wrote the button itself (its "sending" label), as the wait takes
    // precedence.
    function holdButton(button, label, idle) {
        // One span for the label: the buttons are flex rows with a gap, which
        // would otherwise also open between the words and the time.
        const render = (left) => {
            button.innerHTML = `<i class="fa-solid fa-clock" aria-hidden="true"></i><span>${label(`<span class="tabular-nums">${clock(left)}</span>`)}</span>`;
        };
        const stop = onWait({
            start() { button.setAttribute('aria-disabled', 'true'); },
            tick: render,
            done() {
                button.removeAttribute('aria-disabled');
                button.innerHTML = idle();
            },
        });
        return { stop, refresh() { if (waiting()) render(waitLeft); } };
    }

    // Keeps a "send by email" link's mailto in step with the form: build()
    // returns the href from what the form holds now. Rebuilt on every way to
    // reach the link (hover for the status bar, focus, press including the
    // middle button, right-click for "copy address", click), so edits after
    // the error are always in it. A click follows the link after its
    // handlers, so it opens the href set here.
    function keepMailtoCurrent(link, build) {
        const refresh = () => { link.href = build(); };
        ['pointerenter', 'focus', 'pointerdown', 'contextmenu', 'click'].forEach((type) => {
            link.addEventListener(type, refresh);
        });
    }

    // Has a polite live region read out `text`. Emptied first and filled a
    // moment later, so the same text is read again when it repeats.
    function announce(node, text) {
        node.textContent = '';
        setTimeout(() => { node.textContent = text; }, 50);
    }

    const api = { ENDPOINT, retryAfterSeconds, clock, send, countdown, waiting, startWait, onWait, holdButton, announce, keepMailtoCurrent };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AnoraContactApi = api;
})(typeof window !== 'undefined' ? window : globalThis);
