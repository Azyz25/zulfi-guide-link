// تصفية قائمة المحلات في صفحة التصنيف أثناء الكتابة (بلا مكتبات)
(function () {
  var f = document.getElementById('find'), l = document.getElementById('list'), n = document.getElementById('none');
  if (!f || !l) return;
  var items = Array.prototype.slice.call(l.children);
  function norm(s) { return s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase(); }
  var idx = items.map(function (li) { return norm(li.getAttribute('data-n') || ''); });
  f.addEventListener('input', function () {
    var q = norm(f.value.trim()), shown = 0;
    items.forEach(function (li, i) { var ok = !q || idx[i].indexOf(q) !== -1; li.hidden = !ok; if (ok) shown++; });
    n.hidden = shown !== 0;
  });
})();
