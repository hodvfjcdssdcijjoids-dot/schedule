/* ShiftWise — small UI primitives: modal, confirm, toast, event binding. */
(function (global) {
  'use strict';

  const U = global.App.utils;

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  /**
   * Open a modal. Only one modal is open at a time.
   * opts: {title, body (html string), wide, onMount(modalEl),
   *        actions: [{label, className, onClick(modalEl) -> false to keep open}]}
   */
  function openModal(opts) {
    closeModal();
    const root = document.getElementById('modal-root');
    const overlay = el(
      '<div class="modal-overlay">' +
      '  <div class="modal' + (opts.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true">' +
      '    <div class="modal-head">' +
      '      <h3>' + U.escapeHtml(opts.title || '') + '</h3>' +
      '      <button class="icon-btn modal-x" aria-label="Close">&#10005;</button>' +
      '    </div>' +
      '    <div class="modal-body">' + (opts.body || '') + '</div>' +
      '    <div class="modal-foot"></div>' +
      '  </div>' +
      '</div>');
    const foot = overlay.querySelector('.modal-foot');
    (opts.actions || []).forEach(a => {
      const btn = el('<button class="btn ' + (a.className || '') + '">' + U.escapeHtml(a.label) + '</button>');
      btn.addEventListener('click', () => {
        const keepOpen = a.onClick && a.onClick(overlay) === false;
        if (!keepOpen) closeModal();
      });
      foot.appendChild(btn);
    });
    if (!(opts.actions || []).length) foot.remove();

    overlay.querySelector('.modal-x').addEventListener('click', closeModal);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeModal(); });
    root.appendChild(overlay);
    if (opts.onMount) opts.onMount(overlay);
    const first = overlay.querySelector('input, select, button.btn');
    if (first) first.focus();
    return overlay;
  }

  function closeModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
  }

  /** Confirm dialog returning a Promise<boolean>. */
  function confirmDialog(opts) {
    return new Promise(resolve => {
      openModal({
        title: opts.title || 'Are you sure?',
        body: '<p class="confirm-msg">' + U.escapeHtml(opts.message || '') + '</p>',
        actions: [
          { label: 'Cancel', className: 'btn-ghost', onClick: () => resolve(false) },
          { label: opts.confirmLabel || 'Delete',
            className: opts.danger === false ? 'btn-primary' : 'btn-danger',
            onClick: () => resolve(true) }
        ]
      });
    });
  }

  function toast(message, type) {
    const root = document.getElementById('toast-root');
    const t = el('<div class="toast toast-' + (type || 'info') + '">' + U.escapeHtml(message) + '</div>');
    root.appendChild(t);
    setTimeout(() => t.classList.add('toast-show'), 10);
    setTimeout(() => {
      t.classList.remove('toast-show');
      setTimeout(() => t.remove(), 300);
    }, 3800);
  }

  /**
   * Wire up elements with [data-action] inside `root` to `handlers`.
   * Buttons/links get click; inputs/selects get change.
   * Handler signature: (dataset, element, event).
   */
  function bindActions(root, handlers) {
    root.querySelectorAll('[data-action]').forEach(node => {
      const handler = handlers[node.dataset.action];
      if (!handler) return;
      const evt = (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA')
        ? 'change' : 'click';
      node.addEventListener(evt, e => handler(node.dataset, node, e));
    });
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  global.App.ui = { el, openModal, closeModal, confirmDialog, toast, bindActions, download };
})(typeof window !== 'undefined' ? window : globalThis);
