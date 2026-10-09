// Call scheduler for the contact pages. A button with data-call-scheduler opens
// a dialog where visitors pick up to three 20-minute slots and leave their
// details; we confirm one of the slots by email.
//
// Slots come from the office hours in OFFICE, not from a calendar lookup. That
// and the slot arithmetic live in js/call-slots.js, which the page loads first.
// They are shown in the visitor's time zone (detected by the browser).
// The page trusts the visitor's clock and the backend does not check the
// slots, so whoever confirms the call checks them against our calendar.
//
// Submitting POSTs JSON to the SpecScout backend's contact endpoint (the same
// one js/contact-form.js uses), which mails it to us with the visitor's address
// as Reply-To. The endpoint takes plain text only, so the slots, the visitor's
// time zone and details go into the message, a notice to our team built by
// teamLines(): always in English, times in German time.
//   {
//     "subject": "Call request from Jane Doe",     // max 200 chars, mailed with a "[Contact request]" prefix
//     "message": "You've received a call request from Jane Doe.\n\nProposed times, ...\n- Wed 14 Oct 2026, 09:00 (03:00 their time)\n...",  // max 5000 chars
//     "sender_email": "jane@example.com",
//     "website": ""                                // honeypot, bots fill it in
//   }
// "their time" appears only when the visitor's clock differs from ours.
// 204 on success. 429 means the hourly limit is used up; on that and every
// other failure the dialog offers to send the request by email instead, in
// the visitor's words and page language (mailLines()).
(function () {
    'use strict';

    const ENDPOINT = 'https://api.anora-systems.com/api/v1/contact';
    const SUBJECT_MAX_LENGTH = 200;
    const EMAIL = 'info@anora-systems.com';
    const MAX_PICKS = 3;
    // Office hours and slot times (js/call-slots.js). The texts below say
    // "20 minutes" and "9 to 17", so change them together with OFFICE.
    if (!window.AnoraCallSlots) return;
    const { OFFICE, dayKey, keyDate, officeClock, officeOffset, buildSlots } = window.AnoraCallSlots;

    const TEXT = {
        de: {
            locale: 'de-DE',
            eyebrow: 'Anora Systems',
            title: 'Gespräch vereinbaren',
            picksTitle: 'Ihre Terminvorschläge',
            picksHint: 'Wählen Sie bis zu drei Termine. Wir bestätigen einen davon per E-Mail.',
            pickHint: 'Wählen Sie bis zu drei Termine.',
            slot: (n) => `Termin ${n}`,
            pickFirst: 'Tag und Uhrzeit im Kalender wählen',
            remove: (label) => `${label} entfernen`,
            close: 'Schließen',
            step: (n) => `Schritt ${n} von 2`,
            step1Title: 'Wann passt es Ihnen?',
            step2Title: 'Ihre Angaben',
            prevMonth: 'Vorheriger Monat',
            nextMonth: 'Nächster Monat',
            weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
            morning: 'Vormittag',
            afternoon: 'Nachmittag',
            dayPicked: 'Termin gewählt',
            noSlots: 'Gerade sind keine Termine frei. Schreiben Sie uns gern an info@anora-systems.com.',
            full: 'Drei Termine gewählt. Entfernen Sie einen, um einen anderen zu wählen.',
            count: (n) => `${n} von 3 Terminen gewählt`,
            added: (label) => `${label} hinzugefügt.`,
            removed: (label) => `${label} entfernt.`,
            next: 'Weiter',
            back: 'Zurück',
            edit: 'Ändern',
            timeSuffix: ' Uhr',
            zoneHint: 'Uhrzeiten in Ihrer Zeitzone, automatisch erkannt:',
            officeHours: 'Gespräche finden montags bis freitags zwischen 9 und 17 Uhr deutscher Zeit statt.',
            name: 'Name',
            email: 'E-Mail',
            company: 'Unternehmen',
            phone: 'Telefon',
            message: 'Worum soll es gehen?',
            optional: 'optional',
            messageHint: 'z. B. Fragen zum Pilotprogramm',
            invalidEmail: 'Ungültige E-Mail-Adresse',
            privacy: 'Wir nutzen Ihre Angaben nur, um das Gespräch mit Ihnen abzustimmen. Mehr dazu in unserer <a href="datenschutz.html#website" class="text-anoraTeal hover:underline">Datenschutzerklärung</a>.',
            submit: 'Anfrage senden',
            sending: 'Wird gesendet …',
            error: 'Ihre Anfrage konnte gerade nicht gesendet werden. Bitte versuchen Sie es noch einmal oder schicken Sie sie per E-Mail.',
            busy: 'Gerade erreichen uns sehr viele Anfragen. Bitte schicken Sie Ihre per E-Mail oder versuchen Sie es später noch einmal.',
            errorMail: 'Per E-Mail senden',
            doneTitle: 'Vielen Dank!',
            doneText: (email) => `Ihre Anfrage ist bei uns. Wir bestätigen einen Ihrer Termine per E-Mail an ${email}.`,
            mailTitle: 'Fast geschafft',
            mailText: 'Ihr E-Mail-Programm öffnet sich mit Ihrer Anfrage. Senden Sie die E-Mail ab, dann bestätigen wir einen Ihrer Termine.',
            mailNote: 'Falls sich nichts öffnet, schreiben Sie uns an info@anora-systems.com.',
            mailSubject: 'Gesprächsanfrage (20 Minuten)',
            teamLanguage: 'German',
            mailIntro: ['Hallo Anora-Team,', '', 'ich möchte ein 20-minütiges Gespräch zu SpecScout vereinbaren. Diese Termine passen mir:', ''],
            mailOffice: (time) => `(${time} Uhr deutscher Zeit)`,
            mailZone: (zone) => `Meine Zeitzone: ${zone}`,
        },
        en: {
            locale: 'en-GB',
            eyebrow: 'Anora Systems',
            title: 'Book a call',
            picksTitle: 'Your proposed times',
            picksHint: 'Pick up to three times. We confirm one of them by email.',
            pickHint: 'Pick up to three times.',
            slot: (n) => `Time ${n}`,
            pickFirst: 'Choose a day and time in the calendar',
            remove: (label) => `Remove ${label}`,
            close: 'Close',
            step: (n) => `Step ${n} of 2`,
            step1Title: 'When suits you?',
            step2Title: 'Your details',
            prevMonth: 'Previous month',
            nextMonth: 'Next month',
            weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
            morning: 'Morning',
            afternoon: 'Afternoon',
            dayPicked: 'time picked',
            noSlots: 'No times are open right now. Write to us at info@anora-systems.com.',
            full: 'Three times picked. Remove one to choose another.',
            count: (n) => `${n} of 3 times picked`,
            added: (label) => `${label} added.`,
            removed: (label) => `${label} removed.`,
            next: 'Continue',
            back: 'Back',
            edit: 'Change',
            timeSuffix: '',
            zoneHint: 'Times in your time zone, detected automatically:',
            officeHours: 'Calls take place Monday to Friday between 9:00 and 17:00 German time.',
            name: 'Name',
            email: 'Email',
            company: 'Company',
            phone: 'Phone',
            message: 'What would you like to discuss?',
            optional: 'optional',
            messageHint: 'e.g. questions about the pilot program',
            invalidEmail: 'Invalid email',
            privacy: 'We use your details only to arrange the call. More in our <a href="privacy.html#website" class="text-anoraTeal hover:underline">privacy policy</a>.',
            submit: 'Send request',
            sending: 'Sending …',
            error: 'Your request could not be sent just now. Please try again or send it by email.',
            busy: 'We are receiving a lot of requests right now. Please send yours by email or try again later.',
            errorMail: 'Send by email',
            doneTitle: 'Thank you!',
            doneText: (email) => `We have your request and will confirm one of your times by email to ${email}.`,
            mailTitle: 'Almost done',
            mailText: 'Your email program opens with your request. Send the email and we will confirm one of your times.',
            mailNote: 'If nothing opens, write to us at info@anora-systems.com.',
            mailSubject: 'Call request (20 minutes)',
            teamLanguage: 'English',
            mailIntro: ['Hello Anora team,', '', "I'd like to book a 20-minute call about SpecScout. These times suit me:", ''],
            mailOffice: (time) => `(${time} German time)`,
            mailZone: (zone) => `My time zone: ${zone}`,
        },
    };

    const triggers = document.querySelectorAll('[data-call-scheduler]');
    if (!triggers.length || typeof HTMLDialogElement !== 'function') return;

    const t = TEXT[document.documentElement.lang.toLowerCase().startsWith('de') ? 'de' : 'en'];
    const format = (options) => new Intl.DateTimeFormat(t.locale, options);
    const fmtTime = format({ hour: '2-digit', minute: '2-digit' });
    const fmtDay = format({ weekday: 'long', day: 'numeric', month: 'long' });
    const fmtDate = format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fmtShort = format({ weekday: 'short', day: 'numeric', month: 'short' });
    const fmtMonth = format({ month: 'long', year: 'numeric' });
    const fmtMail = format({ weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const fmtMailOffice = format({ hour: '2-digit', minute: '2-digit', timeZone: OFFICE.timeZone });
    const fmtMailOfficeDate = format({ weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: OFFICE.timeZone });
    // The notice to our team is in English and German time, whatever the page language.
    const fmtTeamDay = new Intl.DateTimeFormat('en-GB', { timeZone: OFFICE.timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const fmtTeamTime = new Intl.DateTimeFormat('en-GB', { timeZone: OFFICE.timeZone, hour: '2-digit', minute: '2-digit' });
    const fmtTheirDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const fmtTheirTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
    const visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

    // ---- Time ---------------------------------------------------------------

    function zoneName(locale) {
        try {
            const part = new Intl.DateTimeFormat(locale, { timeZoneName: 'longGeneric' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
            if (part) return part.value;
        } catch (error) {
            // Older browsers do not know "longGeneric".
        }
        return visitorZone.replace(/_/g, ' ');
    }

    // For emails: "Eastern Time (America/New_York)".
    function zoneWithId(name) {
        return visitorZone && name !== visitorZone.replace(/_/g, ' ') ? `${name} (${visitorZone})` : name;
    }

    const zone = zoneName(t.locale);
    const zoneLabel = zoneWithId(zone);
    const teamZoneLabel = zoneWithId(zoneName('en-GB'));

    function slotLabel(ts) { return `${fmtShort.format(ts)} · ${fmtTime.format(ts)}`; }
    function slotRange(ts) { return `${fmtTime.format(ts)}–${fmtTime.format(ts + OFFICE.duration * 60000)}${t.timeSuffix}`; }

    // ---- Markup -------------------------------------------------------------

    const inputClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-anoraTeal focus:border-anoraTeal';
    const primaryClass = 'inline-flex items-center justify-center gap-2 bg-anoraBlue hover:bg-anoraTeal text-white px-6 py-3 rounded-md font-bold transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-anoraBlue focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-anoraTeal';
    const ringClass = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal';

    function field(id, name, label, type, attrs, optional) {
        const suffix = optional ? ` <span class="font-normal text-gray-400">(${t.optional})</span>` : '';
        return `<div>
            <label for="${id}" class="block text-sm font-semibold text-anoraBlue mb-1">${label}${suffix}</label>
            <input id="${id}" name="${name}" type="${type}" ${attrs} class="${inputClass}">
        </div>`;
    }

    function stepHeader(n, title) {
        return `<p class="text-xs font-semibold uppercase tracking-wider text-anoraTeal">${t.step(n)}</p>
            <h3 tabindex="-1" data-heading class="text-xl font-bold text-anoraBlue mt-1 focus:outline-none">${title}</h3>`;
    }

    const markup = `
<dialog id="call-scheduler" aria-labelledby="cs-title" class="open:flex flex-col lg:flex-row m-0 sm:m-auto w-full h-full max-w-full max-h-full sm:w-[calc(100%-2rem)] sm:max-w-5xl sm:h-fit sm:max-h-[calc(100%-2rem)] lg:min-h-[min(38rem,calc(100%-2rem))] overflow-hidden bg-white text-slate-800 sm:rounded-2xl shadow-2xl">
    <button type="button" data-action="close" aria-label="${t.close}" class="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-anoraBlue hover:bg-gray-100 transition ${ringClass}">
        <i class="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
    </button>

    <aside class="shrink-0 lg:w-72 bg-gray-50 border-b lg:border-b-0 lg:border-r border-gray-100 px-5 py-4 pr-16 sm:px-8 sm:py-5 sm:pr-16 lg:p-8 lg:overflow-y-auto">
        <p class="hidden lg:block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">${t.eyebrow}</p>
        <h2 id="cs-title" class="text-lg lg:text-2xl font-bold text-anoraBlue">${t.title}</h2>
        <div class="hidden lg:block mt-8">
            <h3 class="text-sm font-semibold text-anoraBlue">${t.picksTitle}</h3>
            <p class="text-xs text-gray-500 leading-relaxed mt-1">${t.picksHint}</p>
            <ol class="mt-4 space-y-2" data-picks="list"></ol>
        </div>
    </aside>

    <div class="flex-1 min-w-0 min-h-0 flex flex-col">

        <div data-step="1" class="hidden flex-1 min-h-0 flex-col">
            <div class="flex-1 min-h-0 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
                ${stepHeader(1, t.step1Title)}
                <div class="grid md:grid-cols-2 gap-6 md:gap-8 mt-5">
                    <div>
                        <div class="flex items-center justify-between mb-3">
                            <p class="font-semibold text-anoraBlue" data-month aria-live="polite"></p>
                            <div class="flex gap-1">
                                <button type="button" data-action="prev-month" aria-label="${t.prevMonth}" class="w-9 h-9 rounded-full flex items-center justify-center text-anoraBlue hover:bg-gray-100 transition disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-default ${ringClass}"><i class="fa-solid fa-chevron-left text-sm" aria-hidden="true"></i></button>
                                <button type="button" data-action="next-month" aria-label="${t.nextMonth}" class="w-9 h-9 rounded-full flex items-center justify-center text-anoraBlue hover:bg-gray-100 transition disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-default ${ringClass}"><i class="fa-solid fa-chevron-right text-sm" aria-hidden="true"></i></button>
                            </div>
                        </div>
                        <div class="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-400 mb-1" aria-hidden="true">
                            ${t.weekdays.map((day) => `<span class="py-1">${day}</span>`).join('')}
                        </div>
                        <div class="grid grid-cols-7 gap-1" data-days></div>
                    </div>
                    <div>
                        <p class="font-semibold text-anoraBlue mb-3 scroll-mt-4" data-day-label></p>
                        <div class="space-y-4" data-times></div>
                        <p class="text-sm text-anoraBlue bg-anoraOrange/10 border border-anoraOrange/30 rounded-lg px-3 py-2 mt-4 hidden" data-full>${t.full}</p>
                        <p class="flex gap-2 text-xs text-gray-500 leading-relaxed mt-4">
                            <i class="fa-solid fa-globe mt-0.5" aria-hidden="true"></i>
                            <span>${t.zoneHint} <span class="font-semibold text-gray-600" title="${visitorZone}">${zone}</span>.<span class="hidden" data-office> ${t.officeHours}</span></span>
                        </p>
                    </div>
                </div>
            </div>
            <div class="shrink-0 border-t border-gray-100 bg-white px-5 py-4 sm:px-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="lg:hidden flex flex-wrap items-center gap-2 min-h-[2rem]" data-picks="tray"></div>
                <p class="hidden lg:block text-sm text-gray-500" data-count></p>
                <button type="button" data-action="next" class="${primaryClass} w-full sm:w-auto shrink-0">${t.next}<i class="fa-solid fa-arrow-right text-sm" aria-hidden="true"></i></button>
            </div>
        </div>

        <div data-step="2" class="hidden flex-1 min-h-0 flex-col">
            <div class="flex-1 min-h-0 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
                ${stepHeader(2, t.step2Title)}
                <div class="lg:hidden mt-4 rounded-lg bg-gray-50 border border-gray-100 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <p class="text-sm font-semibold text-anoraBlue">${t.picksTitle}</p>
                        <button type="button" data-action="back" class="text-sm font-semibold text-anoraTeal hover:underline ${ringClass} rounded">${t.edit}</button>
                    </div>
                    <ol class="space-y-2" data-picks="summary"></ol>
                </div>
                <form id="cs-form" class="mt-5 space-y-4" novalidate>
                    <div class="grid sm:grid-cols-2 gap-4">
                        ${field('cs-name', 'name', t.name, 'text', 'autocomplete="name" required maxlength="100"', false)}
                        ${field('cs-email', 'email', t.email, 'email', 'autocomplete="email" required maxlength="254"', false)}
                        ${field('cs-company', 'company', t.company, 'text', 'autocomplete="organization" maxlength="100"', true)}
                        ${field('cs-phone', 'phone', t.phone, 'tel', 'autocomplete="tel" maxlength="50"', true)}
                    </div>
                    <div>
                        <label for="cs-message" class="block text-sm font-semibold text-anoraBlue mb-1">${t.message} <span class="font-normal text-gray-400">(${t.optional})</span></label>
                        <textarea id="cs-message" name="message" rows="3" maxlength="4000" placeholder="${t.messageHint}" class="${inputClass}"></textarea>
                    </div>
                    <div class="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
                        <label for="cs-website">Website</label>
                        <input id="cs-website" name="website" type="text" tabindex="-1" autocomplete="off">
                    </div>
                    <p class="text-xs text-gray-500 leading-relaxed">${t.privacy}</p>
                    <div class="hidden rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert" data-error>
                        <p class="flex gap-2"><i class="fa-solid fa-circle-exclamation mt-0.5" aria-hidden="true"></i><span data-error-text>${t.error}</span></p>
                        <a href="mailto:${EMAIL}" data-action="mail" class="inline-block mt-2 ml-6 font-semibold text-red-700 underline hover:text-red-900">${t.errorMail}</a>
                    </div>
                </form>
            </div>
            <div class="shrink-0 border-t border-gray-100 bg-white px-5 py-4 sm:px-8 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                <button type="button" data-action="back" class="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-semibold text-gray-500 hover:text-anoraBlue hover:bg-gray-50 transition ${ringClass}"><i class="fa-solid fa-arrow-left text-xs" aria-hidden="true"></i>${t.back}</button>
                <button type="submit" form="cs-form" data-submit class="${primaryClass} w-full sm:w-auto">${t.submit}</button>
            </div>
        </div>

        <div data-step="3" class="hidden flex-1 min-h-0 flex-col overflow-y-auto">
            <div class="flex-1 flex flex-col items-center justify-center text-center px-6 py-10 sm:px-10">
                <div class="w-16 h-16 rounded-full bg-anoraTeal/10 text-anoraTeal flex items-center justify-center text-2xl mb-5"><i class="fa-solid fa-check" aria-hidden="true"></i></div>
                <h3 tabindex="-1" data-heading class="text-2xl font-bold text-anoraBlue focus:outline-none" data-done-title></h3>
                <p class="text-gray-600 leading-relaxed mt-3 max-w-md" data-done-text></p>
                <ol class="lg:hidden mt-6 w-full max-w-sm space-y-2 text-left" data-picks="done"></ol>
                <p class="text-sm text-gray-500 mt-4 max-w-md" data-done-note></p>
                <button type="button" data-action="close" class="${primaryClass} mt-8">${t.close}</button>
            </div>
        </div>

    </div>

    <p class="sr-only" aria-live="polite" data-live></p>
</dialog>`;

    document.head.insertAdjacentHTML('beforeend', `<style>
        #call-scheduler::backdrop { background: rgba(11, 30, 61, 0.55); backdrop-filter: blur(2px); }
        #call-scheduler[open] { animation: cs-in 0.2s ease-out; }
        @keyframes cs-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { #call-scheduler[open] { animation: none; } }
    </style>`);
    document.body.insertAdjacentHTML('beforeend', markup);

    const dialog = document.getElementById('call-scheduler');
    const $ = (selector) => dialog.querySelector(selector);
    const el = {
        steps: dialog.querySelectorAll('[data-step]'),
        month: $('[data-month]'),
        prev: $('[data-action="prev-month"]'),
        next: $('[data-action="next-month"]'),
        days: $('[data-days]'),
        dayLabel: $('[data-day-label]'),
        times: $('[data-times]'),
        full: $('[data-full]'),
        office: $('[data-office]'),
        count: $('[data-count]'),
        proceed: $('[data-action="next"]'),
        list: $('[data-picks="list"]'),
        tray: $('[data-picks="tray"]'),
        summary: $('[data-picks="summary"]'),
        done: $('[data-picks="done"]'),
        form: $('#cs-form'),
        submit: $('[data-submit]'),
        error: $('[data-error]'),
        errorText: $('[data-error-text]'),
        errorMail: $('[data-action="mail"]'),
        doneTitle: $('[data-done-title]'),
        doneText: $('[data-done-text]'),
        doneNote: $('[data-done-note]'),
        live: $('[data-live]'),
    };

    const sameClockAsOffice = officeOffset(Date.now()) === -new Date().getTimezoneOffset() * 60000;
    el.office.classList.toggle('hidden', sameClockAsOffice);

    // ---- State --------------------------------------------------------------

    let slots = new Map();
    let days = [];
    let picks = [];
    let selectedDay = null;
    let viewYear = 0;
    let viewMonth = 0;
    let step = 1;
    let sending = false;
    let opener = null;

    function refreshSlots() {
        slots = buildSlots();
        days = Array.from(slots.keys());
        picks = picks.filter((ts) => (slots.get(dayKey(new Date(ts))) || []).includes(ts));
        if (!slots.has(selectedDay)) selectedDay = days[0] || null;
        if (selectedDay) showMonthOf(selectedDay);
    }

    function showMonthOf(key) {
        const date = keyDate(key);
        viewYear = date.getFullYear();
        viewMonth = date.getMonth();
    }

    function monthOf(key) { const date = keyDate(key); return date.getFullYear() * 12 + date.getMonth(); }

    // ---- Rendering ----------------------------------------------------------

    function render() {
        renderCalendar();
        renderTimes();
        renderPicks();
    }

    function renderCalendar() {
        const first = new Date(viewYear, viewMonth, 1);
        const lead = (first.getDay() + 6) % 7;
        const length = new Date(viewYear, viewMonth + 1, 0).getDate();
        const today = dayKey(new Date());
        const picked = new Set(picks.map((ts) => dayKey(new Date(ts))));
        const used = Math.ceil((lead + length) / 7) * 7;
        let html = '';
        // Six rows next to the time list, so the dialog keeps its height between
        // months; on phones the calendar stacks above the times and needs no filler.
        for (let cell = 0; cell < 42; cell++) {
            const day = cell - lead + 1;
            if (day < 1 || day > length) {
                html += `<span class="h-10 sm:h-11${cell >= used ? ' hidden md:block' : ''}" aria-hidden="true"></span>`;
                continue;
            }
            const key = dayKey(new Date(viewYear, viewMonth, day));
            const open = slots.has(key);
            const selected = key === selectedDay;
            let label = fmtDate.format(keyDate(key));
            let style = 'text-gray-300 cursor-default';
            if (selected) style = 'bg-anoraBlue text-white shadow-sm';
            else if (open) style = 'bg-anoraTeal/10 text-anoraBlue hover:bg-anoraTeal/20';
            if (key === today && !selected) style += ' ring-1 ring-inset ring-gray-300';
            const dot = picked.has(key)
                ? `<span class="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-anoraTeal'}" aria-hidden="true"></span>`
                : '';
            if (picked.has(key)) label += `, ${t.dayPicked}`;
            html += open
                ? `<button type="button" data-action="day" data-day="${key}" aria-label="${label}" aria-pressed="${selected}" class="relative h-10 sm:h-11 rounded-lg text-sm font-semibold tabular-nums transition ${style} ${ringClass} focus-visible:ring-offset-1">${day}${dot}</button>`
                : `<span class="relative h-10 sm:h-11 rounded-lg text-sm tabular-nums flex items-center justify-center ${style}" aria-hidden="true">${day}</span>`;
        }
        el.days.innerHTML = html;
        el.month.textContent = fmtMonth.format(first);
        const shown = viewYear * 12 + viewMonth;
        el.prev.disabled = !days.length || shown <= monthOf(days[0]);
        el.next.disabled = !days.length || shown >= monthOf(days[days.length - 1]);
    }

    function renderTimes() {
        const list = slots.get(selectedDay) || [];
        const full = picks.length >= MAX_PICKS;
        el.dayLabel.textContent = selectedDay ? fmtDay.format(keyDate(selectedDay)) : '';
        if (!list.length) {
            el.times.innerHTML = `<p class="text-sm text-gray-500">${t.noSlots}</p>`;
        } else {
            const groups = [
                [t.morning, list.filter((ts) => new Date(ts).getHours() < 12)],
                [t.afternoon, list.filter((ts) => new Date(ts).getHours() >= 12)],
            ];
            el.times.innerHTML = groups.filter(([, items]) => items.length).map(([name, items]) => `
                <div>
                    <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">${name}</p>
                    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">${items.map((ts) => timeButton(ts, full)).join('')}</div>
                </div>`).join('');
        }
        el.full.classList.toggle('hidden', !full);
    }

    function timeButton(ts, full) {
        const picked = picks.includes(ts);
        let style = 'border-gray-200 text-anoraBlue hover:border-anoraTeal hover:text-anoraTeal';
        if (picked) style = 'bg-anoraTeal border-anoraTeal text-white shadow-sm';
        else if (full) style = 'border-gray-100 text-gray-300 cursor-not-allowed';
        const check = picked ? '<i class="fa-solid fa-check text-[0.65rem]" aria-hidden="true"></i>' : '';
        return `<button type="button" data-action="slot" data-ts="${ts}" aria-pressed="${picked}" ${full && !picked ? 'disabled' : ''} class="h-10 rounded-lg border text-sm font-semibold tabular-nums inline-flex items-center justify-center gap-1.5 transition ${style} ${ringClass} focus-visible:ring-offset-1">${check}${fmtTime.format(ts)}</button>`;
    }

    function pickItem(ts, index, removable) {
        const remove = removable
            ? `<button type="button" data-action="remove" data-ts="${ts}" aria-label="${t.remove(slotLabel(ts))}" class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition ${ringClass}"><i class="fa-solid fa-xmark text-xs" aria-hidden="true"></i></button>`
            : '';
        return `<li class="flex items-center gap-3 min-h-[3.25rem] rounded-lg bg-white border border-gray-200 pl-3 pr-1.5 py-2">
            <span class="w-6 h-6 shrink-0 rounded-full bg-anoraTeal text-white text-xs font-bold flex items-center justify-center">${index + 1}</span>
            <span class="flex-1 min-w-0 text-sm leading-tight">
                <span class="block font-semibold text-anoraBlue">${fmtShort.format(ts)}</span>
                <span class="block text-gray-500 tabular-nums mt-0.5">${slotRange(ts)}</span>
            </span>${remove}
        </li>`;
    }

    // An open slot. The next one to fill gets a light teal tint; the ones after
    // it stay grey, so nobody thinks they have to click them first.
    function placeholder(index, next) {
        const optional = index ? ` <span class="font-normal text-gray-400">(${t.optional})</span>` : '';
        if (next) {
            return `<li class="flex items-center gap-3 min-h-[3.25rem] rounded-lg bg-anoraTeal/10 px-3 py-2" aria-current="step">
                <span class="w-6 h-6 shrink-0 rounded-full bg-white text-anoraTeal text-xs font-bold flex items-center justify-center">${index + 1}</span>
                <span class="flex-1 min-w-0 text-sm leading-tight">
                    <span class="block font-semibold text-anoraBlue">${t.slot(index + 1)}${optional}</span>
                    ${index ? '' : `<span class="block text-xs text-gray-500 mt-0.5">${t.pickFirst}</span>`}
                </span>
            </li>`;
        }
        return `<li class="flex items-center gap-3 min-h-[3.25rem] rounded-lg bg-gray-100/70 px-3 py-2 text-sm text-gray-400">
            <span class="w-6 h-6 shrink-0 rounded-full bg-gray-200 text-xs font-bold flex items-center justify-center">${index + 1}</span>
            <span>${t.slot(index + 1)}${optional}</span>
        </li>`;
    }

    function chip(ts) {
        return `<span class="inline-flex items-center gap-1 rounded-full bg-anoraTeal/10 text-anoraBlue text-xs font-semibold pl-3 pr-1 py-1">
            ${slotLabel(ts)}
            <button type="button" data-action="remove" data-ts="${ts}" aria-label="${t.remove(slotLabel(ts))}" class="w-6 h-6 rounded-full flex items-center justify-center text-anoraBlue/60 hover:text-anoraBlue hover:bg-anoraTeal/20 transition ${ringClass}"><i class="fa-solid fa-xmark text-[0.65rem]" aria-hidden="true"></i></button>
        </span>`;
    }

    function renderPicks() {
        const list = picks.map((ts, i) => pickItem(ts, i, step !== 3));
        // Open slots only matter while picking.
        if (step === 1) for (let i = picks.length; i < MAX_PICKS; i++) list.push(placeholder(i, i === picks.length));
        el.list.innerHTML = list.join('');
        el.tray.innerHTML = picks.length ? picks.map(chip).join('') : `<p class="text-sm text-gray-500">${t.pickHint}</p>`;
        el.summary.innerHTML = el.done.innerHTML = picks.map((ts, i) => pickItem(ts, i, false)).join('');
        el.count.textContent = picks.length ? t.count(picks.length) : t.pickHint;
        el.proceed.disabled = !picks.length;
    }

    function showStep(n) {
        step = n;
        el.steps.forEach((section) => {
            const shown = Number(section.dataset.step) === n;
            section.classList.toggle('hidden', !shown);
            section.classList.toggle('flex', shown);
        });
        render();
    }

    function focusHeading() {
        $(`[data-step="${step}"] [data-heading]`).focus();
    }

    function announce(text) {
        el.live.textContent = '';
        setTimeout(() => { el.live.textContent = text; }, 50);
    }

    // ---- Actions ------------------------------------------------------------

    function selectDay(key) {
        selectedDay = key;
        showMonthOf(key);
        render();
        $(`[data-action="day"][data-day="${key}"]`).focus();
    }

    function shiftMonth(delta) {
        const shown = viewYear * 12 + viewMonth + delta;
        const key = days.find((day) => monthOf(day) === shown);
        if (key) {
            selectedDay = key;
            showMonthOf(key);
            render();
        }
    }

    function togglePick(ts) {
        const index = picks.indexOf(ts);
        if (index >= 0) {
            picks.splice(index, 1);
            announce(`${t.removed(slotLabel(ts))} ${t.count(picks.length)}.`);
        } else if (picks.length < MAX_PICKS) {
            picks.push(ts);
            picks.sort((a, b) => a - b);
            announce(`${t.added(slotLabel(ts))} ${t.count(picks.length)}.`);
        }
        render();
    }

    // Arrow keys move between open days; up and down jump a week.
    function nearbyDay(key, delta) {
        const date = keyDate(key);
        date.setDate(date.getDate() + delta);
        const target = dayKey(date);
        if (slots.has(target)) return target;
        return delta > 0 ? days.find((day) => day > target) : days.slice().reverse().find((day) => day < target);
    }

    function open(trigger) {
        opener = trigger;
        if (step === 3) reset();
        refreshSlots();
        showStep(picks.length || step === 1 ? step : 1);
        const root = document.documentElement;
        const scrollbar = window.innerWidth - root.clientWidth;
        root.style.overflow = 'hidden';
        if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
        dialog.showModal();
        focusHeading();
    }

    function reset() {
        picks = [];
        el.form.reset();
        el.error.classList.add('hidden');
        step = 1;
    }

    function formData() {
        const data = {};
        new FormData(el.form).forEach((value, key) => { data[key] = String(value).trim(); });
        return data;
    }

    // The request as our team reads it: who asked, when, their message, then their details.
    function teamLines(data) {
        const lines = [`You've received a call request from ${data.name}.`, '', `Proposed times, ${OFFICE.duration} minutes each, in German time:`];
        picks.forEach((ts) => {
            let line = `- ${fmtTeamDay.format(ts)}, ${fmtTeamTime.format(ts)}`;
            if (!sameClockAsOffice) {
                // The visitor's date only when it differs from the German one.
                const sameDay = officeClock(ts).day === new Date(ts).getDate();
                line += ` (${sameDay ? '' : `${fmtTheirDay.format(ts)}, `}${fmtTheirTime.format(ts)} their time)`;
            }
            lines.push(line);
        });
        if (data.message) lines.push('', "Here's the message they sent:", data.message);
        lines.push('', `Email: ${data.email}`);
        if (data.company) lines.push(`Company: ${data.company}`);
        if (data.phone) lines.push(`Phone: ${data.phone}`);
        lines.push(`Their time zone: ${teamZoneLabel}`, `They used the ${t.teamLanguage} version of the site.`);
        return lines;
    }

    // The request in the visitor's words, for the email fallback.
    function mailLines(data) {
        const lines = t.mailIntro.slice();
        picks.forEach((ts) => {
            let line = `- ${fmtMail.format(ts)}${t.timeSuffix}`;
            if (!sameClockAsOffice) {
                // German date only when it differs from the visitor's.
                const sameDay = officeClock(ts).day === new Date(ts).getDate();
                line += ` ${t.mailOffice((sameDay ? fmtMailOffice : fmtMailOfficeDate).format(ts))}`;
            }
            lines.push(line);
        });
        lines.push('', t.mailZone(zoneLabel));
        lines.push('', `${t.name}: ${data.name}`, `${t.email}: ${data.email}`);
        if (data.company) lines.push(`${t.company}: ${data.company}`);
        if (data.phone) lines.push(`${t.phone}: ${data.phone}`);
        if (data.message) lines.push('', data.message);
        return lines;
    }

    function mailto(data) {
        return `mailto:${EMAIL}?subject=${encodeURIComponent(t.mailSubject)}&body=${encodeURIComponent(mailLines(data).join('\r\n'))}`;
    }

    function finish(byMail, data) {
        el.doneTitle.textContent = byMail ? t.mailTitle : t.doneTitle;
        el.doneText.textContent = byMail ? t.mailText : t.doneText(data.email);
        el.doneNote.textContent = byMail ? t.mailNote : '';
        el.error.classList.add('hidden');
        showStep(3);
        focusHeading();
    }

    function setSending(on) {
        sending = on;
        el.submit.disabled = on;
        el.submit.innerHTML = on ? `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>${t.sending}` : t.submit;
    }

    async function submit(event) {
        event.preventDefault();
        if (sending || !picks.length) return;
        // The form is novalidate so the browser does not add its own hover
        // tooltips to invalid fields; this shows the usual warning instead.
        if (!el.form.reportValidity()) return;
        const data = formData();
        el.error.classList.add('hidden');
        setSending(true);
        const controller = new AbortController();
        // The backend sends the mail while the request waits.
        const timer = setTimeout(() => controller.abort(), 20000);
        let busy = false;
        try {
            const response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: `Call request from ${data.name}`.slice(0, SUBJECT_MAX_LENGTH),
                    message: teamLines(data).join('\n'),
                    sender_email: data.email,
                    website: data.website || '',
                }),
                signal: controller.signal,
            });
            if (response.ok) {
                finish(false, data);
                return;
            }
            busy = response.status === 429;
        } catch (error) {
            // Offline, blocked or timed out: handled below like a refused request.
        } finally {
            clearTimeout(timer);
            setSending(false);
        }
        el.errorText.textContent = busy ? t.busy : t.error;
        el.errorMail.href = mailto(data);
        el.error.classList.remove('hidden');
    }

    // ---- Events -------------------------------------------------------------

    triggers.forEach((trigger) => trigger.addEventListener('click', (event) => {
        event.preventDefault();
        open(trigger);
    }));

    // Close on a click on the backdrop, but not when a text selection ends there.
    let pressedBackdrop = false;
    dialog.addEventListener('pointerdown', (event) => { pressedBackdrop = event.target === dialog; });

    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) {
            if (pressedBackdrop) dialog.close();
            return;
        }
        const target = event.target.closest('[data-action]');
        if (!target || target.disabled) return;
        const action = target.dataset.action;
        if (action === 'close') {
            dialog.close();
        } else if (action === 'prev-month' || action === 'next-month') {
            shiftMonth(action === 'prev-month' ? -1 : 1);
            if (target.disabled) $(`[data-action="day"][data-day="${selectedDay}"]`).focus();
        } else if (action === 'day') {
            selectDay(target.dataset.day);
            if (window.matchMedia('(max-width: 767px)').matches) {
                const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                el.dayLabel.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
            }
        } else if (action === 'slot') {
            const ts = Number(target.dataset.ts);
            togglePick(ts);
            $(`[data-action="slot"][data-ts="${ts}"]`).focus();
        } else if (action === 'remove') {
            const container = target.closest('[data-picks]');
            const index = Array.from(container.querySelectorAll('[data-action="remove"]')).indexOf(target);
            togglePick(Number(target.dataset.ts));
            if (step === 2 && !picks.length) showStep(1);
            const rest = container.querySelectorAll('[data-action="remove"]');
            if (rest.length) rest[Math.min(index, rest.length - 1)].focus();
            else focusHeading();
        } else if (action === 'next') {
            [['cs-name', 'cf-name'], ['cs-email', 'cf-email']].forEach(([to, from]) => {
                const source = document.getElementById(from);
                const input = document.getElementById(to);
                if (source && !input.value) input.value = source.value.trim();
            });
            showStep(2);
            focusHeading();
        } else if (action === 'back') {
            showStep(1);
            focusHeading();
        } else if (action === 'mail') {
            // The link opens the email program; show the matching confirmation.
            setTimeout(() => finish(true, formData()), 0);
        }
    });

    el.days.addEventListener('keydown', (event) => {
        const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        const key = event.target.dataset && event.target.dataset.day;
        if (!key || !(event.key in moves)) return;
        event.preventDefault();
        const target = nearbyDay(key, moves[event.key]);
        if (target) selectDay(target);
    });

    el.form.addEventListener('submit', submit);

    // A short message instead of the browser's detailed one ("Please include an '@' ...").
    // Rechecked on every keystroke, because the browser keeps an open warning
    // up to date while the visitor types.
    const emailInput = $('#cs-email');
    const checkEmail = () => emailInput.setCustomValidity(emailInput.validity.typeMismatch ? t.invalidEmail : '');
    emailInput.addEventListener('invalid', checkEmail);
    emailInput.addEventListener('input', checkEmail);

    dialog.addEventListener('close', () => {
        document.documentElement.style.overflow = '';
        document.body.style.paddingRight = '';
        if (opener) opener.focus();
    });
})();
