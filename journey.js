(() => {
    'use strict';

    const section = document.getElementById('journey');
    if (!section) return;
    const milestones = [...section.querySelectorAll('.journey-milestone')];

    // Native disclosures keep every milestone usable without JavaScript.
    // Enforce the exclusive group in browsers that do not support details.name.
    for (const milestone of milestones) {
        const summary = milestone.querySelector('summary');
        const close = milestone.querySelector('.journey-close');
        close.hidden = false;
        milestone.addEventListener('toggle', () => {
            if (milestone.open) {
                for (const other of milestones) {
                    if (other !== milestone) other.open = false;
                }
            }
        });
        close.addEventListener('click', () => {
            milestone.open = false;
            summary.focus({ preventScroll: true });
        });
    }

    section.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const active = milestones.find(milestone => milestone.open);
        if (!active) return;
        active.open = false;
        active.querySelector('summary').focus({ preventScroll: true });
        event.preventDefault();
    });

    // Pause the only ambient animation outside the viewport and in hidden tabs.
    let inView = false;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => section.classList.toggle(
        'journey-in-view', inView && !document.hidden && !motion.matches
    );
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            inView = entries[0].isIntersecting;
            updateMotion();
        }, { threshold: 0.05 }).observe(section);
    }
    document.addEventListener('visibilitychange', updateMotion);
    motion.addEventListener('change', updateMotion);
})();
