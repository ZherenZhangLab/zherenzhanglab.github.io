(() => {
    'use strict';

    const section = document.querySelector('#research');
    if (!section) return;

    const directions = [...section.querySelectorAll('.card')].map(card => {
        const button = card.querySelector('.research-toggle');
        const state = { hover: false, focus: false, pinned: false, dismissed: false };
        const render = () => {
            const open = !state.dismissed && (state.hover || state.focus || state.pinned);
            card.toggleAttribute('data-research-open', open);
            button.setAttribute('aria-pressed', String(open));
        };
        const close = () => {
            state.pinned = false;
            state.dismissed = true;
            render();
        };

        button.disabled = false;
        card.addEventListener('pointerenter', event => {
            // Touch pointers must reveal only after a completed tap, never during scrolling.
            if (event.pointerType === 'touch') return;
            state.hover = true;
            state.dismissed = false;
            render();
        });
        card.addEventListener('pointerleave', () => {
            state.hover = false;
            if (!state.focus) state.dismissed = false;
            render();
        });
        button.addEventListener('focus', () => {
            state.focus = button.matches(':focus-visible');
            state.dismissed = false;
            render();
        });
        button.addEventListener('blur', () => {
            state.focus = false;
            state.dismissed = false;
            render();
        });
        card.addEventListener('click', () => {
            // Preserve text selection; the native button also supplies Enter/Space activation.
            if (window.getSelection()?.toString()) return;
            const wasOpen = card.hasAttribute('data-research-open');
            directions.forEach(direction => {
                if (direction.card !== card) direction.close();
            });
            state.pinned = !wasOpen;
            state.dismissed = wasOpen;
            render();
        });
        return { card, close };
    });

    document.addEventListener('click', event => {
        if (!directions.some(({ card }) => card.contains(event.target))) {
            directions.forEach(({ close }) => close());
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') directions.forEach(({ close }) => close());
    });
})();
