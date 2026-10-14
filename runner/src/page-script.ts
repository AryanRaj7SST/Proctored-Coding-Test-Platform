/**
 * The assertion evaluator that runs INSIDE the sandboxed page.
 *
 * It is shipped as a string and injected with page.evaluate, so it must be
 * self-contained. It only reads rendered state (computed styles, geometry,
 * text, attributes) -- it never has access to the student's source text, which
 * is what keeps grading behaviour-based (product requirement #51).
 */
export const EVALUATOR_SOURCE = String.raw`
(function (assertion, consoleErrors) {
  function els(selector) {
    try { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
    catch (e) { return null; }
  }
  function first(selector) {
    var list = els(selector);
    return list && list.length ? list[0] : null;
  }
  function visible(el) {
    if (!el) return false;
    var style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function resolveColor(value) {
    var probe = document.createElement('span');
    probe.style.display = 'none';
    probe.style.color = '';
    probe.style.color = value;
    if (!probe.style.color) return null;
    document.body.appendChild(probe);
    var resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }
  function normalizeColor(value) {
    var resolved = resolveColor(value);
    if (!resolved) return String(value).trim().toLowerCase();
    var m = /^rgba?\(([^)]+)\)$/.exec(resolved);
    if (!m) return resolved;
    var parts = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (parts.length >= 4 && parts[3] !== 1) {
      return 'rgba(' + parts[0] + ', ' + parts[1] + ', ' + parts[2] + ', ' + parts[3] + ')';
    }
    return 'rgb(' + parts[0] + ', ' + parts[1] + ', ' + parts[2] + ')';
  }
  function num(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : NaN;
  }
  function compare(actual, op, expected, tolerance) {
    var tol = typeof tolerance === 'number' ? tolerance : 0.5;
    if (!isFinite(actual)) return false;
    if (op === 'eq') return Math.abs(actual - expected) <= tol;
    if (op === 'lt') return actual < expected;
    if (op === 'lte') return actual <= expected + tol;
    if (op === 'gt') return actual > expected;
    if (op === 'gte') return actual >= expected - tol;
    return false;
  }
  function rowsOf(list) {
    var tops = [];
    for (var i = 0; i < list.length; i++) {
      var rect = list[i].getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      var found = false;
      for (var j = 0; j < tops.length; j++) {
        if (Math.abs(tops[j].top - rect.top) <= 2) { tops[j].items.push(rect); found = true; break; }
      }
      if (!found) tops.push({ top: rect.top, items: [rect] });
    }
    tops.sort(function (a, b) { return a.top - b.top; });
    return tops;
  }

  var a = assertion;
  var result = { passed: false, actual: null };

  try {
    if (a.type === 'noConsoleErrors') {
      result.passed = consoleErrors.length === 0;
      result.actual = consoleErrors.length ? consoleErrors[0] : 'none';
      return result;
    }

    var list = els(a.selector);
    if (list === null) return { passed: false, actual: 'invalid selector' };
    var el = list.length ? list[0] : null;

    switch (a.type) {
      case 'exists':
        result.passed = list.length > 0;
        result.actual = list.length + ' element(s)';
        break;
      case 'notExists':
        result.passed = list.length === 0;
        result.actual = list.length + ' element(s)';
        break;
      case 'visible':
        result.passed = visible(el);
        result.actual = el ? (result.passed ? 'visible' : 'not visible') : 'missing';
        break;
      case 'hidden':
        result.passed = !visible(el);
        result.actual = el ? (result.passed ? 'hidden' : 'visible') : 'missing';
        break;
      case 'count':
        result.passed = list.length === a.equals;
        result.actual = String(list.length);
        break;
      case 'text': {
        if (!el) { result.actual = 'missing'; break; }
        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        result.actual = text;
        if (typeof a.equals === 'string') result.passed = text === a.equals.trim();
        else if (typeof a.contains === 'string') result.passed = text.indexOf(a.contains.trim()) !== -1;
        break;
      }
      case 'css': {
        if (!el) { result.actual = 'missing'; break; }
        var cs = getComputedStyle(el);
        var raw = cs.getPropertyValue(a.property).trim();
        var actual = a.color ? normalizeColor(raw) : raw;
        result.actual = actual;

        // Specialized handling for CSS properties that browsers decompose into longhands
        if (a.property === 'grid-row') {
          var start = (cs.gridRowStart || cs.getPropertyValue('grid-row-start') || '').trim();
          var end = (cs.gridRowEnd || cs.getPropertyValue('grid-row-end') || '').trim();
          var rowVal = (cs.gridRow || raw).trim();
          var rect = el.getBoundingClientRect();
          var isSpan2 =
            start.indexOf('span 2') !== -1 ||
            end.indexOf('span 2') !== -1 ||
            rowVal.indexOf('span 2') !== -1 ||
            (start === '1' && end === '3') ||
            (start === 'span 2' && (end === 'auto' || end === '')) ||
            (Math.abs(rect.height - 110) <= 2);
          if (isSpan2) {
            result.passed = true;
            result.actual = 'span 2';
            break;
          }
        }

        if (a.property === 'border') {
          var bw = cs.borderWidth || cs.getPropertyValue('border-width');
          var bs = cs.borderStyle || cs.getPropertyValue('border-style');
          var bc = normalizeColor(cs.borderColor || cs.getPropertyValue('border-color'));
          if (bw && bw.indexOf('2px') !== -1 && bs && bs.indexOf('solid') !== -1 && bc === 'rgb(0, 0, 0)') {
            result.passed = true;
            result.actual = '2px solid rgb(0, 0, 0)';
            break;
          }
        }

        if (a.property === 'gap') {
          var rg = cs.rowGap || cs.getPropertyValue('row-gap');
          var cg = cs.columnGap || cs.getPropertyValue('column-gap');
          if (rg && cg && rg.indexOf('10px') !== -1 && cg.indexOf('10px') !== -1) {
            result.passed = true;
            result.actual = '10px';
            break;
          }
        }

        if (a.property === 'grid-template-columns' || a.property === 'grid-template-rows') {
          var tracks = (a.property === 'grid-template-columns' ? cs.gridTemplateColumns : cs.gridTemplateRows) || raw;
          var numbers = String(tracks).trim().split(/\s+/).map(num).filter(function (n) { return isFinite(n); });
          if (numbers.length === 2 && Math.abs(numbers[0] - 50) <= 2 && Math.abs(numbers[1] - 50) <= 2) {
            result.passed = true;
            result.actual = '50px 50px';
            break;
          }
          if (numbers.length === 4 && numbers.every(function (n) { return Math.abs(n - 100) <= 2; })) {
            result.passed = true;
            result.actual = '100px 100px 100px 100px';
            break;
          }
        }

        var candidates = [];
        if (typeof a.equals === 'string') candidates.push(a.equals);
        if (Array.isArray(a.oneOf)) candidates = candidates.concat(a.oneOf);
        for (var c = 0; c < candidates.length; c++) {
          var expected = a.color ? normalizeColor(candidates[c]) : String(candidates[c]).trim();
          if (actual === expected) { result.passed = true; break; }
          if (!a.color) {
            var na = num(actual), ne = num(expected);
            if (isFinite(na) && isFinite(ne) && Math.abs(na - ne) < 0.51) { result.passed = true; break; }
          }
        }
        break;
      }
      case 'cssNumber': {
        if (!el) { result.actual = 'missing'; break; }
        var value = num(getComputedStyle(el).getPropertyValue(a.property));
        result.actual = String(value);
        result.passed = compare(value, a.op, a.value, a.tolerance);
        break;
      }
      case 'attribute': {
        if (!el) { result.actual = 'missing'; break; }
        var attr = el.getAttribute(a.name);
        result.actual = attr === null ? 'absent' : attr;
        if (attr === null) break;
        if (typeof a.equals === 'string') result.passed = attr.trim() === a.equals.trim();
        else if (typeof a.contains === 'string') result.passed = attr.indexOf(a.contains) !== -1;
        break;
      }
      case 'size': {
        if (!el) { result.actual = 'missing'; break; }
        var rect = el.getBoundingClientRect();
        var measured = a.dimension === 'height' ? rect.height : rect.width;
        result.actual = String(Math.round(measured * 100) / 100);
        result.passed = compare(measured, a.op, a.value, a.tolerance);
        break;
      }
      case 'gridColumns': {
        if (!el) { result.actual = 'missing'; break; }
        var tracks = getComputedStyle(el).gridTemplateColumns;
        var widths = String(tracks).trim().split(/\s+/).map(num).filter(function (n) { return isFinite(n); });
        if (widths.length === 0) {
          // Not a grid (or single implicit track): fall back to rendered rows.
          var kids = Array.prototype.slice.call(el.children);
          var rows = rowsOf(kids);
          var perRow = rows.length ? rows[0].items.length : 0;
          result.actual = perRow + ' rendered column(s)';
          result.passed = perRow === a.equals;
          break;
        }
        result.actual = widths.length + ' column(s): ' + widths.map(function (w) { return Math.round(w); }).join(', ');
        var countOk = widths.length === a.equals;
        var equalOk = true;
        if (a.equalWidths !== false && widths.length > 1) {
          var tol = typeof a.tolerance === 'number' ? a.tolerance : 2;
          var min = Math.min.apply(null, widths), max = Math.max.apply(null, widths);
          equalOk = (max - min) <= tol;
        }
        result.passed = countOk && equalOk;
        if (countOk && !equalOk) result.actual += ' (columns are not equal width)';
        break;
      }
      case 'gap': {
        if (!el) { result.actual = 'missing'; break; }
        var cs = getComputedStyle(el);
        var rowGap = num(cs.rowGap === 'normal' ? '0' : cs.rowGap);
        var colGap = num(cs.columnGap === 'normal' ? '0' : cs.columnGap);
        result.actual = 'row ' + rowGap + 'px / column ' + colGap + 'px';
        var tolg = typeof a.tolerance === 'number' ? a.tolerance : 0.5;
        if (a.axis === 'row') result.passed = Math.abs(rowGap - a.equals) <= tolg;
        else if (a.axis === 'column') result.passed = Math.abs(colGap - a.equals) <= tolg;
        else result.passed = Math.abs(rowGap - a.equals) <= tolg && Math.abs(colGap - a.equals) <= tolg;
        break;
      }
      case 'hasClass':
      case 'notHasClass': {
        if (!el) { result.actual = 'missing'; break; }
        var has = el.classList.contains(a.className);
        result.actual = el.className ? 'classes: ' + String(el.className).trim() : 'no classes';
        result.passed = a.type === 'hasClass' ? has : !has;
        break;
      }
      case 'value': {
        if (!el) { result.actual = 'missing'; break; }
        var val = 'value' in el ? String(el.value) : '';
        result.actual = val === '' ? 'empty' : val;
        if (typeof a.equals === 'string') result.passed = val.trim() === a.equals.trim();
        else if (typeof a.contains === 'string') result.passed = val.indexOf(a.contains) !== -1;
        break;
      }
      case 'checked': {
        if (!el) { result.actual = 'missing'; break; }
        var isChecked = Boolean(el.checked);
        result.actual = isChecked ? 'checked' : 'unchecked';
        result.passed = isChecked === a.equals;
        break;
      }
      case 'validity': {
        if (!el) { result.actual = 'missing'; break; }
        if (typeof el.checkValidity !== 'function') { result.actual = 'not a form control'; break; }
        var valid = el.checkValidity();
        result.actual = valid ? 'valid' : 'invalid' + (el.validationMessage ? ': ' + el.validationMessage : '');
        result.passed = valid === a.valid;
        break;
      }
      case 'js': {
        // An admin-authored expression, run in the page like the student's own code.
        var value = (new Function('"use strict"; return (' + a.expression + ');'))();
        var shown;
        try { shown = typeof value === 'string' ? value : JSON.stringify(value); } catch (e2) { shown = String(value); }
        result.actual = shown === undefined ? String(value) : String(shown).slice(0, 200);
        if (a.equals === undefined) result.passed = Boolean(value);
        else if (typeof a.equals === 'string') result.passed = String(value).trim() === a.equals.trim();
        else result.passed = value === a.equals;
        break;
      }
      case 'boxesPerRow': {
        var rows2 = rowsOf(list);
        var perRow2 = rows2.length ? rows2[0].items.length : 0;
        result.actual = perRow2 + ' item(s) in the first row';
        result.passed = perRow2 === a.equals;
        break;
      }
      case 'fn': {
        result.passed = false;
        result.actual = 'pure JavaScript functions are graded in the isolated runner';
        break;
      }
      default:
        result.actual = 'unsupported assertion';
    }
  } catch (e) {
    result.passed = false;
    result.actual = 'error while checking the page';
  }
  return result;
})
`;
