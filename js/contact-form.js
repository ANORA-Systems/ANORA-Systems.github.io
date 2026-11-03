// Written contact form on the contact pages. The form (data-contact-form)
// sends the message through js/contact-api.js, which the page loads first and
// which describes the endpoint and its answers. Texts the script generates
// (subject, trailer labels, button labels) are picked from <html lang>; the
// visitor-facing blocks (error, confirmations) are markup on the page.
//
// On any failure the form shows an error with a link that opens the visitor's
// email program with the same message instead. When the hourly limit is used
// up and the backend says how long to wait, the send button stays off and
// counts down (m:ss) until the visitor may send again.
(function () {
    'use strict';

    const EMAIL = 'info@anora-systems.com';
    if (!window.AnoraContactApi) return;
    const { send, waiting, startWait, onWait, holdButton, announce, keepMailtoCurrent } = window.AnoraContactApi;

    const TEXT = {
        de: {
            subject: (name) => `Nachricht von ${name}`,
            mailSubject: 'Anfrage über anora-systems.com',
            name: 'Name',
            email: 'E-Mail',
            labels: { company: 'Unternehmen', shop: 'Shopsystem', catalog: 'Katalogumfang' },
            invalidEmail: 'Ungültige E-Mail-Adresse',
            sending: 'Wird gesendet …',
            waiting: (time) => `Erneut senden in ${time}`,
            ready: 'Sie können Ihre Nachricht jetzt wieder senden.',
        },
        en: {
            subject: (name) => `Message from ${name}`,
            mailSubject: 'Inquiry via anora-systems.com',
            name: 'Name',
            email: 'Email',
            labels: { company: 'Company', shop: 'Shop system', catalog: 'Catalog size' },
            invalidEmail: 'Invalid email',
            sending: 'Sending …',
            waiting: (time) => `Send again in ${time}`,
            ready: 'You can send your message again now.',
        },
    };

    const form = document.querySelector('[data-contact-form]');
    if (!form) return;

    const t = TEXT[document.documentElement.lang.toLowerCase().startsWith('de') ? 'de' : 'en'];
    const el = {
        submit: form.querySelector('[data-submit]'),
        error: form.querySelector('[data-error]'),
        errorTexts: form.querySelectorAll('[data-error-text]'),
        errorMail: form.querySelector('[data-action="mail"]'),
        email: form.querySelector('[name="email"]'),
        live: form.querySelector('[data-live]'),
        done: {
            sent: document.querySelector('[data-done="sent"]'),
            mail: document.querySelector('[data-done="mail"]'),
        },
    };
    const submitLabel = el.submit.innerHTML;
    let sending = false;

    function formData() {
        const data = {};
        new FormData(form).forEach((value, key) => { data[key] = String(value).trim(); });
        return data;
    }

    // The message, then the visitor's details, as the mail should read.
    function messageLines(data) {
        const lines = [data.message, '', '--', `${t.name}: ${data.name}`, `${t.email}: ${data.email}`];
        Object.keys(t.labels).forEach((key) => {
            if (data[key]) lines.push(`${t.labels[key]}: ${data[key]}`);
        });
        return lines;
    }

    function mailto(data) {
        return `mailto:${EMAIL}?subject=${encodeURIComponent(t.mailSubject)}&body=${encodeURIComponent(messageLines(data).join('\r\n'))}`;
    }

    // kind: 'failed', 'busy' (limit used up, no time known) or 'wait' (limit
    // used up, the button counts down).
    function showError(kind) {
        el.errorTexts.forEach((node) => {
            node.classList.toggle('hidden', node.dataset.errorText !== kind);
        });
        el.error.classList.remove('hidden');
    }

    // Hide the form and show the matching confirmation.
    function finish(how, data) {
        unwatch.forEach((stop) => stop());
        const panel = el.done[how];
        const emailNode = panel.querySelector('[data-done-email]');
        if (emailNode) emailNode.textContent = data.email;
        form.classList.add('hidden');
        panel.classList.remove('hidden');
        const heading = panel.querySelector('[data-heading]');
        if (heading) heading.focus();
    }

    function buttonLabel() {
        return sending ? `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${t.sending}` : submitLabel;
    }

    // During the wait after a 429 (from this form or the call scheduler) the
    // button counts down and the wait message shows; at zero both go and
    // screen readers, which heard the role="alert" message, hear that the
    // wait is over. finish() stops both, as the form is gone by then.
    const hold = holdButton(el.submit, t.waiting, buttonLabel);
    const unwatch = [hold.stop, onWait({
        start() { showError('wait'); },
        tick() {},
        done() {
            el.error.classList.add('hidden');
            // While a request of this form is still open, its result speaks next.
            if (!sending) announce(el.live, t.ready);
        },
    })];

    function setSending(on) {
        sending = on;
        el.submit.disabled = on;
        el.submit.innerHTML = buttonLabel();
        hold.refresh();
    }

    async function submit(event) {
        event.preventDefault();
        if (sending || waiting()) return;
        // The form is novalidate so the browser does not add its own hover
        // tooltips to invalid fields; this shows the usual warning instead.
        if (!form.reportValidity()) return;
        const data = formData();
        el.error.classList.add('hidden');
        setSending(true);
        const result = await send({
            subject: t.subject(data.name),
            message: messageLines(data).join('\n'),
            senderEmail: data.email,
            website: data.website,
        });
        setSending(false);
        if (result.status === 'sent') {
            finish('sent', data);
            return;
        }
        // A wait, new or started by the call scheduler while this request ran,
        // keeps its message rather than the one for this request.
        if (result.status === 'busy' && result.retryAfter) startWait(result.retryAfter);
        else if (!waiting()) showError(result.status);
    }

    form.addEventListener('submit', submit);

    // The link opens the email program with the message as it reads now;
    // then the matching confirmation.
    keepMailtoCurrent(el.errorMail, () => mailto(formData()));
    el.errorMail.addEventListener('click', () => {
        const data = formData();
        setTimeout(() => finish('mail', data), 0);
    });

    // A short message instead of the browser's detailed one ("Please include an '@' ...").
    // Rechecked on every keystroke, because the browser keeps an open warning
    // up to date while the visitor types.
    const checkEmail = () => el.email.setCustomValidity(el.email.validity.typeMismatch ? t.invalidEmail : '');
    el.email.addEventListener('invalid', checkEmail);
    el.email.addEventListener('input', checkEmail);
})();
