// Written contact form on the contact pages. The form (data-contact-form)
// POSTs the message as JSON to the SpecScout backend's contact endpoint, which
// mails it to us with the visitor's address as Reply-To. Texts the script
// generates (subject, trailer labels) are picked from <html lang>; the
// visitor-facing blocks (error, confirmations) are markup on the page.
//
// Request body (backend: app/models/pydantic/contact_request.py):
//   {
//     "subject": "Nachricht von Jane Doe",   // one line, max 200 chars; mailed with a "[Contact request]" prefix
//     "message": "...",                      // max 5000 chars: the message plus a trailer with the visitor's details
//     "sender_email": "jane@example.com",    // becomes the mail's Reply-To
//     "website": ""                          // honeypot, bots fill it in
//   }
// 204 on success. Errors come as {"detail": "...", "code": "..."}: 403 from a
// foreign origin, 429 when the hourly limit is used up, 503 when the mail
// server did not take the message. On any failure the form shows an error with
// a link that opens the visitor's email program with the same message instead.
(function () {
    'use strict';

    const ENDPOINT = 'https://api.anora-systems.com/api/v1/contact';
    const EMAIL = 'info@anora-systems.com';
    const SUBJECT_MAX_LENGTH = 200;
    const TIMEOUT = 20000;

    const TEXT = {
        de: {
            subject: (name) => `Nachricht von ${name}`,
            mailSubject: 'Anfrage über anora-systems.com',
            name: 'Name',
            email: 'E-Mail',
            labels: { company: 'Unternehmen', shop: 'Shopsystem', catalog: 'Katalogumfang' },
            invalidEmail: 'Ungültige E-Mail-Adresse',
            sending: 'Wird gesendet …',
        },
        en: {
            subject: (name) => `Message from ${name}`,
            mailSubject: 'Inquiry via anora-systems.com',
            name: 'Name',
            email: 'Email',
            labels: { company: 'Company', shop: 'Shop system', catalog: 'Catalog size' },
            invalidEmail: 'Invalid email',
            sending: 'Sending …',
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

    function showError(busy) {
        el.errorTexts.forEach((node) => {
            node.classList.toggle('hidden', (node.dataset.errorText === 'busy') !== busy);
        });
        el.error.classList.remove('hidden');
    }

    // Hide the form and show the matching confirmation.
    function finish(how, data) {
        const panel = el.done[how];
        const emailNode = panel.querySelector('[data-done-email]');
        if (emailNode) emailNode.textContent = data.email;
        form.classList.add('hidden');
        panel.classList.remove('hidden');
        const heading = panel.querySelector('[data-heading]');
        if (heading) heading.focus();
    }

    function setSending(on) {
        sending = on;
        el.submit.disabled = on;
        el.submit.innerHTML = on ? `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${t.sending}` : submitLabel;
    }

    async function submit(event) {
        event.preventDefault();
        if (sending) return;
        // The form is novalidate so the browser does not add its own hover
        // tooltips to invalid fields; this shows the usual warning instead.
        if (!form.reportValidity()) return;
        const data = formData();
        el.error.classList.add('hidden');
        setSending(true);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT);
        let busy = false;
        try {
            const response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: t.subject(data.name).slice(0, SUBJECT_MAX_LENGTH),
                    message: messageLines(data).join('\n'),
                    sender_email: data.email,
                    website: data.website || '',
                }),
                signal: controller.signal,
            });
            if (response.ok) {
                finish('sent', data);
                return;
            }
            busy = response.status === 429;
        } catch (error) {
            // Offline, blocked or timed out: handled below like a refused request.
        } finally {
            clearTimeout(timer);
            setSending(false);
        }
        el.errorMail.href = mailto(data);
        showError(busy);
    }

    form.addEventListener('submit', submit);

    // The link opens the email program; show the matching confirmation.
    el.errorMail.addEventListener('click', () => {
        setTimeout(() => finish('mail', formData()), 0);
    });

    // A short message instead of the browser's detailed one ("Please include an '@' ...").
    // Rechecked on every keystroke, because the browser keeps an open warning
    // up to date while the visitor types.
    const checkEmail = () => el.email.setCustomValidity(el.email.validity.typeMismatch ? t.invalidEmail : '');
    el.email.addEventListener('invalid', checkEmail);
    el.email.addEventListener('input', checkEmail);
})();
