// Page-side helpers for the regression suite. Kept free of test logic: they only build markup,
// construct pickers and record what the picker and Bootstrap report.
(function () {
  'use strict';

  const root = () => document.getElementById('root');
  const Picker = () => window.mds.MdsPersianDateTimePicker;

  // Records Bootstrap lifecycle events and target change events per field.
  const log = {};
  const record = (id, name) => { (log[id] = log[id] || []).push(name); };

  function field(id, parent) {
    const wrap = document.createElement('div');
    wrap.className = 'mb-3';
    wrap.innerHTML =
      `<label class="form-label" for="${id}">${id}</label>` +
      `<input type="text" class="form-control" id="${id}" autocomplete="off">` +
      `<input type="hidden" id="${id}_value">`;
    (parent || root()).appendChild(wrap);
    const input = wrap.querySelector(`#${id}`);
    const hidden = wrap.querySelector(`#${id}_value`);
    for (const name of ['show', 'shown', 'hide', 'hidden']) {
      input.addEventListener(`${name}.bs.popover`, () => record(id, name));
    }
    hidden.addEventListener('change', () => record(id, 'change:' + hidden.value));
    return input;
  }

  function make(id, options, parent) {
    const input = document.getElementById(id) || field(id, parent);
    return new (Picker())(input, Object.assign({
      targetTextSelector: `#${id}`,
      targetDateSelector: `#${id}_value`,
      dateFormat: 'yyyy-MM-dd',
      textFormat: 'yyyy/MM/dd',
      isGregorian: false,
      persianNumber: true,
    }, options || {}));
  }

  function instance(id) {
    const el = document.getElementById(id);
    return el ? Picker().getInstance(el) : null;
  }

  function tip(id) {
    const el = document.getElementById(id);
    const tipId = el && el.getAttribute('aria-describedby');
    return tipId ? document.getElementById(tipId) : null;
  }

  function modal(id, bodyHtml) {
    const el = document.createElement('div');
    el.className = 'modal fade';
    el.id = id;
    el.tabIndex = -1;
    el.innerHTML =
      '<div class="modal-dialog"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title">Modal</h5>' +
      '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
      `<div class="modal-body">${bodyHtml || ''}</div>` +
      '</div></div>';
    document.body.appendChild(el);
    return el;
  }

  function offcanvas(id) {
    const el = document.createElement('div');
    el.className = 'offcanvas offcanvas-end';
    el.id = id;
    el.tabIndex = -1;
    el.innerHTML =
      '<div class="offcanvas-header"><h5 class="offcanvas-title">Offcanvas</h5>' +
      '<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button></div>' +
      '<div class="offcanvas-body"></div>';
    document.body.appendChild(el);
    return el;
  }

  // Resolves once Bootstrap has fired the named event on the element.
  function once(element, eventName) {
    return new Promise(resolve => element.addEventListener(eventName, resolve, { once: true }));
  }

  window.T = { field, make, instance, tip, modal, offcanvas, once, log };
})();
