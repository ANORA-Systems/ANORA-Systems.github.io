// Scroll spy for the homepage nav: colours the menu link of the section in
// view, the way the contact page marks "Kontakt". It works on the "#id" links
// inside [data-nav-menu] (the desktop row and the mobile menu).
(function () {
    'use strict';

    const ACTIVE = 'text-anoraTeal';
    const INACTIVE = 'text-gray-600';

    const links = Array.from(document.querySelectorAll('[data-nav-menu] a[href^="#"]'));
    const sections = Array.from(new Set(links.map((link) => link.getAttribute('href').slice(1))))
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    let current = null;
    let scheduled = false;

    function update() {
        scheduled = false;

        // The current section is the last one whose top has passed a line a third
        // of the way down the viewport. Tops count minus scroll-margin, so a
        // section reached through its menu link is current right away.
        const line = window.innerHeight / 3;
        let section = null;
        for (const candidate of sections) {
            const margin = parseFloat(getComputedStyle(candidate).scrollMarginTop) || 0;
            if (candidate.getBoundingClientRect().top - margin <= line) section = candidate;
        }
        // Past the end of the last one (the contact block at the bottom) none is.
        if (section && section.getBoundingClientRect().bottom <= line) section = null;

        const id = section ? section.id : null;
        if (id === current) return;
        current = id;

        links.forEach((link) => {
            const active = link.getAttribute('href') === `#${id}`;
            link.classList.toggle(ACTIVE, active);
            link.classList.toggle(INACTIVE, !active);
            if (active) {
                link.setAttribute('aria-current', 'location');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    function schedule() {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(update);
        }
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
})();
