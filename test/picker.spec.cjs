// Regression suite for the Rased patches on top of upstream v5.0.1.
//
// Each test names the failure it guards against. Tests marked "reproduction" fail on the
// unmodified v5.0.1 build; the others guard behaviour the patches must not break.
const { test, expect } = require('playwright/test');

const harnessUrl = '/test/harness.html';

// 1404/07/12 (2025-10-04). Days below are Jalali yyyymmdd numbers in that month.
const MEHR_1404 = [2025, 9, 4];
const SETTLE_MS = Number(process.env.MDS_SETTLE_MS || 0);

async function load(page) {
  await page.goto(harnessUrl);
  await page.waitForFunction(() => window.mds && window.T && window.bootstrap);
}

// Constructs a popover picker showing Mehr 1404 and waits until its Bootstrap popover exists.
async function makeReady(page, id, options = {}, parentSelector = null) {
  await page.evaluate(({ id, options, parentSelector, show }) => {
    const parent = parentSelector ? document.querySelector(parentSelector) : null;
    T.make(id, Object.assign({ selectedDateToShow: new Date(...show) }, options), parent);
  }, { id, options, parentSelector, show: MEHR_1404 });
  await page.waitForFunction(id => T.instance(id) && T.instance(id).getBsPopoverInstance(), id);
}

// Opens the picker with a real click and waits for Bootstrap's shown event. The field's event
// log starts afresh, so later waits for 'hidden' refer to this opening.
async function open(page, id) {
  await page.evaluate(id => { T.log[id] = []; }, id);
  await page.click(`#${id}`);
  await page.waitForFunction(id => (T.log[id] || []).includes('shown'), id);
  // Only for classifying tests against the unpatched build, whose listeners arrive 500ms late.
  if (SETTLE_MS) await page.waitForTimeout(SETTLE_MS);
}

async function visiblePopovers(page) {
  return page.evaluate(() => [...document.querySelectorAll('.mds-bs-persian-datetime-picker-popover.show')].length);
}

async function errors(page) {
  return page.evaluate(() => window.pageErrors);
}

async function clickDay(page, id, dayNumber) {
  await page.evaluate(({ id, dayNumber }) => {
    T.tip(id).querySelector(`td[data-day][data-number="${dayNumber}"]`).click();
  }, { id, dayNumber });
}

test.beforeEach(async ({ page }) => { await load(page); });

test.describe('Bootstrap transitions', () => {
  test('reproduction: clearing a date while the popover is closing does not throw', async ({ page }) => {
    await makeReady(page, 'a');
    await open(page, 'a');
    // Selecting a day starts the closing transition; clearing it straight away schedules the
    // picker's rebuild, which upstream runs as Popover.dispose() before Bootstrap's hide
    // callback has finished with _activeTrigger.
    await page.evaluate(() => {
      T.tip('a').querySelector('td[data-day][data-number="14040710"]').click();
      T.instance('a').clearDate();
    });
    await page.waitForFunction(() => T.instance('a').getBsPopoverInstance() && !document.querySelector('.mds-bs-persian-datetime-picker-popover'));
    await page.waitForTimeout(400);
    expect(await errors(page)).toEqual([]);
    expect(await page.inputValue('#a')).toBe('');
    expect(await page.inputValue('#a_value')).toBe('');
    await page.click('#a');
    await expect(page.locator('.mds-bs-persian-datetime-picker-popover.show')).toHaveCount(1);
    await expect(page.locator('.mds-bs-persian-datetime-picker-popover td[data-mds-dtp-selected-day]')).toHaveCount(0);
  });

  test('reproduction: setting a date while the popover is opening applies it and does not throw', async ({ page }) => {
    await makeReady(page, 'a');
    await page.evaluate(() => {
      document.getElementById('a').click();
      T.instance('a').setDate(new Date(2025, 9, 6));
    });
    await page.waitForTimeout(700);
    expect(await errors(page)).toEqual([]);
    expect(await page.inputValue('#a_value')).toBe('2025-10-06');
    // The popover was not left half-disposed: it opens again and shows the new day.
    if (await visiblePopovers(page) === 0) await page.click('#a');
    await expect(page.locator('.mds-bs-persian-datetime-picker-popover.show td[data-mds-dtp-selected-day]')).toHaveAttribute('data-number', '14040714');
  });

  test('rapid set/clear/set settles on the last value', async ({ page }) => {
    await makeReady(page, 'a');
    await open(page, 'a');
    await page.evaluate(() => {
      const p = T.instance('a');
      p.setDate(new Date(2025, 9, 5));
      p.clearDate();
      p.setDate(new Date(2025, 9, 8));
    });
    await page.waitForTimeout(800);
    expect(await errors(page)).toEqual([]);
    expect(await page.inputValue('#a_value')).toBe('2025-10-08');
    await page.click('#a');
    await expect(page.locator('.mds-bs-persian-datetime-picker-popover.show td[data-mds-dtp-selected-day]')).toHaveAttribute('data-number', '14040716');
  });

  test('reproduction: disposing while the popover is closing does not throw', async ({ page }) => {
    await makeReady(page, 'a');
    await open(page, 'a');
    await page.evaluate(() => {
      T.tip('a').querySelector('td[data-day][data-number="14040710"]').click();
      T.instance('a').dispose();
    });
    await page.waitForTimeout(500);
    expect(await errors(page)).toEqual([]);
    expect(await page.inputValue('#a_value')).toBe('2025-10-02');
    await expect(page.locator('.mds-bs-persian-datetime-picker-popover')).toHaveCount(0);
  });
});

test.describe('Disposal and re-initialisation', () => {
  test('reproduction: a picker disposed before its first render never comes back', async ({ page }) => {
    await page.evaluate(() => { T.make('a').dispose(); });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById('a').hasAttribute('data-mds-dtp-guid'))).toBe(false);
    await page.click('#a');
    await page.waitForTimeout(400);
    expect(await visiblePopovers(page)).toBe(0);
    expect(await errors(page)).toEqual([]);
  });

  test('reproduction: initialising the same input twice leaves one working picker', async ({ page }) => {
    await page.evaluate(show => {
      T.make('a', { selectedDateToShow: new Date(...show) });
      T.make('a', { selectedDateToShow: new Date(...show) });
    }, MEHR_1404);
    await page.waitForFunction(() => T.instance('a').getBsPopoverInstance());
    await open(page, 'a');
    await clickDay(page, 'a', '14040710');
    await page.waitForFunction(() => T.log.a.includes('hidden'));
    await page.waitForTimeout(300);
    // One selection is one change. Upstream's first instance stays registered with its own
    // listeners, and both handle the click.
    expect(await page.evaluate(() => T.log.a.filter(e => e.startsWith('change:')))).toEqual(['change:2025-10-02']);
    expect(await errors(page)).toEqual([]);
  });

  test('reproduction: disposing a modal-mode picker removes its modal', async ({ page }) => {
    await page.evaluate(() => { T.make('m', { modalMode: true }); });
    await page.waitForFunction(() => T.instance('m') && T.instance('m').getBsModalInstance());
    await page.evaluate(() => T.instance('m').dispose());
    await expect(page.locator('.mds-bs-persian-datetime-picker-modal')).toHaveCount(0);
  });

  test('a disposed and recreated dynamic row works like a new one', async ({ page }) => {
    await makeReady(page, 'row1');
    await page.evaluate(() => {
      T.instance('row1').dispose();
      document.getElementById('row1').closest('.mb-3').remove();
    });
    await makeReady(page, 'row1');
    await open(page, 'row1');
    await clickDay(page, 'row1', '14040720');
    await page.waitForFunction(() => document.getElementById('row1_value').value === '2025-10-12');
    expect(await errors(page)).toEqual([]);
  });
});

test.describe('Event listeners', () => {
  test('reproduction: a day can be chosen as soon as the calendar has opened', async ({ page }) => {
    await makeReady(page, 'a');
    await page.evaluate(() => {
      const input = document.getElementById('a');
      input.addEventListener('shown.bs.popover', () => {
        T.tip('a').querySelector('td[data-day][data-number="14040710"]').click();
      }, { once: true });
      input.click();
    });
    await page.waitForFunction(() => T.log.a.includes('shown'));
    await page.waitForTimeout(300);
    expect(await page.inputValue('#a_value')).toBe('2025-10-02');
  });

  test('reproduction: a day tapped while the calendar is still fading in is chosen', async ({ page }) => {
    await makeReady(page, 'a');
    await page.evaluate(() => {
      document.getElementById('a').click();
      // The next frame: the popover is on screen and still in Bootstrap's opening transition.
      requestAnimationFrame(() => T.tip('a').querySelector('td[data-day][data-number="14040710"]').click());
    });
    await page.waitForFunction(() => (T.log.a || []).includes('hidden'), null, { timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(300);
    expect(await page.inputValue('#a_value')).toBe('2025-10-02');
    expect(await errors(page)).toEqual([]);
  });

  test('reproduction: a picker closed quickly does not handle clicks in another picker', async ({ page }) => {
    await makeReady(page, 'a');
    await makeReady(page, 'b', { selectedDateToShow: new Date(2026, 2, 10) }); // Esfand 1404
    // A closes before its own document listeners have been registered: upstream registers them
    // on a 500ms timer that hiding does not cancel, so they arrive after A has closed and stay.
    await page.evaluate(() => { T.log.a = []; document.getElementById('a').click(); });
    await page.waitForFunction(() => T.log.a.includes('shown'));
    await page.evaluate(() => T.instance('a').hide());
    await page.waitForFunction(() => T.log.a.includes('hidden'));
    await page.waitForTimeout(700);
    await open(page, 'b');
    await page.waitForTimeout(700); // B's own listeners are in place on either build
    await clickDay(page, 'b', '14041219');
    await page.waitForFunction(() => T.log.b.includes('hidden'));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => T.log.b.filter(e => e.startsWith('change:')))).toEqual(['change:2026-03-10']);
    expect(await page.inputValue('#a_value')).toBe('');
    // A still shows its own month when it opens again.
    await open(page, 'a');
    await expect(page.locator(`#${await page.evaluate(() => document.getElementById('a').getAttribute('aria-describedby'))} td[data-number="14040710"]`)).toHaveCount(1);
    expect(await errors(page)).toEqual([]);
  });

  test('clicking the field of an open picker keeps it open', async ({ page }) => {
    await makeReady(page, 'a');
    await open(page, 'a');
    await page.click('#a');
    await page.waitForTimeout(400);
    expect(await visiblePopovers(page)).toBe(1);
  });

  test('opening one picker closes the other and outside clicks close it', async ({ page }) => {
    await makeReady(page, 'a');
    // Far enough below A that A's open calendar does not cover B's field.
    await page.evaluate(() => { document.getElementById('root').insertAdjacentHTML('beforeend', '<div style="height:420px"></div>'); });
    await makeReady(page, 'b');
    await open(page, 'a');
    await open(page, 'b');
    await page.waitForTimeout(300);
    expect(await visiblePopovers(page)).toBe(1);
    await page.mouse.click(5, 5);
    await page.waitForFunction(() => T.log.b.includes('hidden'));
    expect(await visiblePopovers(page)).toBe(0);
  });

  test('Escape closes the calendar and keeps focus on the field', async ({ page }) => {
    await makeReady(page, 'a');
    await open(page, 'a');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => T.log.a.includes('hidden'));
    expect(await page.evaluate(() => document.activeElement.id)).toBe('a');
  });
});

test.describe('Modals and offcanvas', () => {
  test('reproduction: the time box of a picker inside a modal can take focus', async ({ page }) => {
    await page.evaluate(() => {
      const m = T.modal('dlg');
      T.field('a', m.querySelector('.modal-body'));
      const shown = T.once(m, 'shown.bs.modal');
      bootstrap.Modal.getOrCreateInstance(m).show();
      return shown;
    });
    await makeReady(page, 'a', { enableTimePicker: true, dateFormat: 'yyyy-MM-dd HH:mm', textFormat: 'yyyy/MM/dd HH:mm' });
    await open(page, 'a');
    await page.evaluate(() => T.tip('a').querySelector('[data-mds-dtp-time]').focus());
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.activeElement.hasAttribute('data-mds-dtp-time'))).toBe(true);
    await page.keyboard.type('0930');
    await clickDay(page, 'a', '14040710');
    await page.waitForFunction(() => document.getElementById('a_value').value !== '');
    expect(await page.inputValue('#a_value')).toBe('2025-10-02 09:30');
    expect(await errors(page)).toEqual([]);
  });

  test('Escape inside a modal closes the calendar first, then the modal', async ({ page }) => {
    await page.evaluate(() => {
      const m = T.modal('dlg');
      T.field('a', m.querySelector('.modal-body'));
      const shown = T.once(m, 'shown.bs.modal');
      bootstrap.Modal.getOrCreateInstance(m).show();
      return shown;
    });
    await makeReady(page, 'a');
    await open(page, 'a');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => T.log.a.includes('hidden'));
    expect(await page.evaluate(() => document.getElementById('dlg').classList.contains('show'))).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('dlg').classList.contains('show'));
  });

  test('reproduction: closing an offcanvas closes the calendar opened inside it', async ({ page }) => {
    await page.evaluate(() => {
      const o = T.offcanvas('side');
      T.field('a', o.querySelector('.offcanvas-body'));
      const shown = T.once(o, 'shown.bs.offcanvas');
      bootstrap.Offcanvas.getOrCreateInstance(o).show();
      return shown;
    });
    await makeReady(page, 'a');
    await open(page, 'a');
    await page.evaluate(() => {
      const o = document.getElementById('side');
      const hidden = T.once(o, 'hidden.bs.offcanvas');
      bootstrap.Offcanvas.getInstance(o).hide();
      return hidden;
    });
    await page.waitForTimeout(300);
    expect(await visiblePopovers(page)).toBe(0);
    expect(await errors(page)).toEqual([]);
  });

  test('a picker in a scrolled modal stays attached to its field', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    await page.evaluate(() => {
      const m = T.modal('dlg', '<div style="height:900px"></div>');
      m.querySelector('.modal-dialog').classList.add('modal-dialog-scrollable');
      T.field('a', m.querySelector('.modal-body'));
      const shown = T.once(m, 'shown.bs.modal');
      bootstrap.Modal.getOrCreateInstance(m).show();
      return shown;
    });
    await makeReady(page, 'a');
    await page.evaluate(() => document.getElementById('a').scrollIntoView({ block: 'center' }));
    await open(page, 'a');
    const gap = await page.evaluate(async () => {
      document.querySelector('#dlg .modal-body').scrollTop -= 60;
      await new Promise(r => setTimeout(r, 200));
      const field = document.getElementById('a').getBoundingClientRect();
      const tip = T.tip('a').getBoundingClientRect();
      // Below the field, or above it when Popper flips it.
      return Math.min(Math.abs(tip.top - field.bottom), Math.abs(field.top - tip.bottom));
    });
    expect(gap).toBeLessThan(20);
  });
});

test.describe('Forms', () => {
  test('the year list Cancel button of an inline picker does not submit its form', async ({ page }) => {
    await page.evaluate(show => {
      const form = document.createElement('form');
      form.id = 'f';
      form.action = 'about:blank';
      form.innerHTML = '<div id="inline"></div><button type="submit">Save</button>';
      window.submitted = 0;
      form.addEventListener('submit', e => { e.preventDefault(); window.submitted++; });
      document.getElementById('root').appendChild(form);
      new mds.MdsPersianDateTimePicker(document.getElementById('inline'), { inLine: true, selectedDateToShow: new Date(...show) });
    }, MEHR_1404);
    await page.waitForSelector('#inline [mds-pdtp-select-year-button]');
    await page.waitForTimeout(200);
    await page.click('#inline [mds-pdtp-select-year-button]');
    await page.click('#inline [data-mds-hide-year-list-box]');
    expect(await page.evaluate(() => window.submitted)).toBe(0);
  });

  test('reproduction: Enter in the time box of an inline picker does not submit its form', async ({ page }) => {
    await page.evaluate(show => {
      const form = document.createElement('form');
      form.innerHTML = '<div id="inline"></div><input name="other"><button type="submit">Save</button>';
      window.submitted = 0;
      form.addEventListener('submit', e => { e.preventDefault(); window.submitted++; });
      document.getElementById('root').appendChild(form);
      new mds.MdsPersianDateTimePicker(document.getElementById('inline'), {
        inLine: true, enableTimePicker: true, selectedDateToShow: new Date(...show),
      });
    }, MEHR_1404);
    await page.waitForSelector('#inline [data-mds-dtp-time]');
    await page.waitForTimeout(200);
    await page.click('#inline [data-mds-dtp-time]');
    await page.keyboard.type('1015');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.submitted)).toBe(0);
  });
});

test.describe('Calendar', () => {
  for (const timezoneId of ['Asia/Tehran', 'UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    test.describe(timezoneId, () => {
      test.use({ timezoneId });

      test('Nowruz and leap Esfand map to the right Gregorian days', async ({ page }) => {
        const result = await page.evaluate(() => {
          const P = mds.MdsPersianDateTimePicker;
          const fmt = d => P.convertDateToString(d, false, 'yyyy/MM/dd');
          return {
            esfand30_1403: fmt(new Date(2025, 2, 20)),
            nowruz1404: fmt(new Date(2025, 2, 21)),
            esfand29_1404: fmt(new Date(2026, 2, 20)),
            nowruz1405: fmt(new Date(2026, 2, 21)),
          };
        });
        expect(result).toEqual({
          esfand30_1403: '۱۴۰۳/۱۲/۳۰',
          nowruz1404: '۱۴۰۴/۰۱/۰۱',
          esfand29_1404: '۱۴۰۴/۱۲/۲۹',
          nowruz1405: '۱۴۰۵/۰۱/۰۱',
        });
      });

      test('selecting a day writes that day, and Esfand has the right length', async ({ page }) => {
        await makeReady(page, 'a', { selectedDateToShow: new Date(2025, 2, 10) }); // Esfand 1403
        await open(page, 'a');
        const days = await page.evaluate(() => [...T.tip('a').querySelectorAll('td[data-day]')].map(td => td.getAttribute('data-number')));
        expect(days.at(-1)).toBe('14031230');
        await clickDay(page, 'a', '14031230');
        await page.waitForFunction(() => document.getElementById('a_value').value !== '');
        expect(await page.inputValue('#a_value')).toBe('2025-03-20');
        expect(await page.inputValue('#a')).toBe('۱۴۰۳/۱۲/۳۰');

        await page.evaluate(() => T.instance('a').setDate(new Date(2026, 2, 1))); // Esfand 1404
        await page.waitForTimeout(400);
        await open(page, 'a');
        const days1404 = await page.evaluate(() => [...T.tip('a').querySelectorAll('td[data-day]')].map(td => td.getAttribute('data-number')));
        expect(days1404.at(-1)).toBe('14041229');
        await page.evaluate(() => T.tip('a').querySelector('[data-change-date-button][title="ماه بعد"]').click());
        await expect(page.locator('.mds-bs-persian-datetime-picker-popover.show td[data-day]').first()).toHaveAttribute('data-number', '14050101');
        expect(await errors(page)).toEqual([]);
      });
    });
  }

  test('linked from/to pickers restrict each other', async ({ page }) => {
    await makeReady(page, 'from', { fromDate: true, groupId: 'range' });
    await makeReady(page, 'to', { toDate: true, groupId: 'range' });
    await open(page, 'from');
    await clickDay(page, 'from', '14040710');
    await page.waitForFunction(() => T.log.from.includes('hidden'));
    await page.waitForTimeout(300);
    await open(page, 'to');
    const disabled = await page.evaluate(() => {
      const t = T.tip('to');
      return {
        before: t.querySelector('td[data-number="14040709"]').hasAttribute('disabled'),
        same: t.querySelector('td[data-number="14040710"]').hasAttribute('disabled'),
        after: t.querySelector('td[data-number="14040711"]').hasAttribute('disabled'),
      };
    });
    expect(disabled).toEqual({ before: true, same: false, after: false });
    await clickDay(page, 'to', '14040715');
    await page.waitForFunction(() => document.getElementById('to_value').value === '2025-10-07');
    await page.waitForTimeout(300);
    await open(page, 'from');
    expect(await page.evaluate(() => T.tip('from').querySelector('td[data-number="14040716"]').hasAttribute('disabled'))).toBe(true);
    expect(await errors(page)).toEqual([]);
  });

  test('min/max restrictions disable days outside the range', async ({ page }) => {
    await page.evaluate(show => T.make('a', {
      selectedDateToShow: new Date(...show),
      disableBeforeDate: new Date(2025, 9, 1),
      disableAfterDate: new Date(2025, 9, 10),
    }), MEHR_1404);
    await page.waitForFunction(() => T.instance('a').getBsPopoverInstance());
    await open(page, 'a');
    await clickDay(page, 'a', '14040720'); // 2025-10-12, after the limit
    await page.waitForTimeout(300);
    expect(await page.inputValue('#a_value')).toBe('');
    await clickDay(page, 'a', '14040712');
    await page.waitForFunction(() => document.getElementById('a_value').value === '2025-10-04');
  });
});

test.describe('Layout', () => {
  for (const width of [320, 360, 390]) {
    test(`the calendar fits a ${width}px wide screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await makeReady(page, 'a');
      await open(page, 'a');
      const box = await page.evaluate(() => {
        const r = T.tip('a').getBoundingClientRect();
        return { left: r.left, right: r.right, scroll: document.documentElement.scrollWidth };
      });
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.scroll).toBeLessThanOrEqual(width);
    });
  }
});
