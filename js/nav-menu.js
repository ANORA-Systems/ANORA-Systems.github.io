// Mobile menu of the full nav (_build/layouts/nav-full.html): the button opens and
// closes it and swaps its icon; a click on one of its links closes it again.
(function () {
    'use strict';

    const button = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (!button || !menu) return;
    const openIcon = button.querySelector('[data-menu-icon="open"]');
    const closeIcon = button.querySelector('[data-menu-icon="close"]');

    function setOpen(open) {
        menu.classList.toggle('hidden', !open);
        openIcon.classList.toggle('hidden', open);
        closeIcon.classList.toggle('hidden', !open);
        button.setAttribute('aria-expanded', String(open));
    }

    button.addEventListener('click', () => setOpen(menu.classList.contains('hidden')));
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
})();
