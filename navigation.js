/* Progressive enhancement: the complete link list remains visible without JS. */
(() => {
    const nav = document.querySelector('nav');
    const toggle = nav?.querySelector('.nav-toggle');
    const links = nav?.querySelector('.nav-links');
    if (!toggle || !links) return;

    const mobile = window.matchMedia('(max-width: 860px)');
    const close = (restoreFocus = false) => {
        toggle.setAttribute('aria-expanded', 'false');
        if (restoreFocus) toggle.focus();
    };
    toggle.hidden = false;
    nav.dataset.menuReady = '';
    toggle.addEventListener('click', () => {
        toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
    });
    nav.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
            close(true);
        }
    });
    links.addEventListener('click', (event) => {
        if (mobile.matches && event.target.closest('a')) close(true);
    });
    nav.addEventListener('focusout', (event) => {
        if (!nav.contains(event.relatedTarget)) close();
    });
    document.addEventListener('pointerdown', (event) => {
        if (mobile.matches && !nav.contains(event.target)) close();
    });
    mobile.addEventListener('change', () => {
        const focusWasInside = nav.contains(document.activeElement);
        close();
        if (focusWasInside) (mobile.matches ? toggle : links.querySelector('a')).focus();
    });
})();
