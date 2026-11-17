// منطق لوحة التاجر الخالص (بلا DOM): يعمل في المتصفح وفي اختبارات Node.
(function (root) {
  'use strict';

  var WEEK_MS = 7 * 86400000;
  var weekOf = function (ms) { return Math.floor(ms / WEEK_MS); };

  var AR = '٠١٢٣٤٥٦٧٨٩';
  var ar = function (n) { return String(n).replace(/[0-9]/g, function (d) { return AR[+d]; }); };
  /** يحوّل الأرقام العربية والفارسية إلى لاتينية (لحقول يكتبها التاجر بلوحة مفاتيح عربية). */
  var latin = function (s) {
    return String(s == null ? '' : s).replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); }).replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); });
  };

  /** إحصاءات المحل المعروضة: مجاميع، نسبة التحويل، الأسبوع الحالي والماضي، ساعة الذروة. */
  function statsOf(b, nowMs) {
    var s = (b && b.stats) || {};
    var n = function (k) { return Number(s[k]) || 0; };
    var views = n('views'), calls = n('calls'), wa = n('whatsapp'), dir = n('directions');
    var acts = calls + wa + dir;
    var w = weekOf(nowMs);
    var hours = [];
    for (var h = 0; h < 24; h++) hours.push(n('h' + h));
    var mx = Math.max.apply(null, hours);
    var rev = (b && b.reviews) || [];
    var sum = rev.reduce(function (a, r) { return a + (Number(r.rating) || 0); }, 0);
    return {
      views: views, calls: calls, whatsapp: wa, directions: dir, acts: acts,
      conversion: views === 0 ? 0 : Math.min(100, Math.round(acts * 100 / views)),
      weekViews: n('wv' + w), prevWeekViews: n('wv' + (w - 1)), weekActs: n('wa' + w), prevWeekActs: n('wa' + (w - 1)),
      hours: hours, peak: mx === 0 ? -1 : hours.indexOf(mx), peakMax: mx,
      ratingCount: rev.length, rating: rev.length ? sum / rev.length : 0,
    };
  }

  /** مقارنة أسبوعية كنص: +٢٠٪ / -١٠٪ / جديد / — */
  function diffText(now, prev) {
    if (prev === 0) return now === 0 ? '—' : 'جديد';
    return (now >= prev ? '+' : '-') + ar(Math.round(Math.abs(now - prev) * 100 / prev)) + '٪';
  }

  /** عرض جديد بصيغة الخادم: التواريخ {_t: ملّي ثانية}، والحقول الاختيارية لا تُكتب فارغة. */
  function makeOffer(f) {
    var title = String(f.title || '').trim();
    if (!title) throw new Error('اكتب نص العرض');
    var start = Number(f.start), end = Number(f.end);
    if (!isFinite(start) || !isFinite(end)) throw new Error('اختر تاريخ البداية والنهاية');
    if (end <= start) throw new Error('نهاية العرض يجب أن تكون بعد بدايته');
    var o = { title: title, start: { _t: start }, end: { _t: end } };
    var opt = function (k, v) { v = String(v == null ? '' : v).trim(); if (v) o[k] = v; };
    opt('description', f.description); opt('discount', f.discount); opt('code', f.code); opt('terms', f.terms); opt('image', f.image);
    var min = Number(latin(f.minOrder));
    if (min > 0) o.minOrder = min;
    return o;
  }

  /** بداية اليوم ونهايته بتوقيت الرياض (UTC+3) لتاريخ yyyy-mm-dd من حقل date. */
  function riyadhDay(ymd, endOfDay) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return NaN;
    var base = Date.UTC(+m[1], +m[2] - 1, +m[3], -3, 0, 0);
    return endOfDay ? base + 86400000 - 1000 : base;
  }
  var offerState = function (o, nowMs) {
    var s = o.start && o.start._t, e = o.end && o.end._t;
    return nowMs < s ? 'upcoming' : nowMs < e ? 'active' : 'ended';
  };

  /** صنف جديد في القائمة. */
  function makeItem(f) {
    var name = String(f.name || '').trim();
    var price = Number(latin(f.price));
    if (!name) throw new Error('اكتب اسم الصنف');
    if (!isFinite(price) || price < 0) throw new Error('اكتب سعراً صحيحاً');
    var it = { name: name, price: price, description: String(f.description || '').trim(), available: true };
    if (f.image) it.image = f.image;
    return it;
  }

  /** ساعات الدوام من حقول: {1:{o:'09:00',c:'22:00',off:false},...} إلى صيغة الخادم {"1":[{o,c}]}. الإغلاق بعد منتصف الليل يزيد 1440. */
  function hoursToWire(rows) {
    var out = {};
    Object.keys(rows).forEach(function (d) {
      var r = rows[d];
      if (!r || r.off || !r.o || !r.c) return;
      var p = function (t) { var m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? (+m[1]) * 60 + (+m[2]) : NaN; };
      var o = p(r.o), c = p(r.c);
      if (!isFinite(o) || !isFinite(c)) return;
      if (c <= o) c += 1440;
      out[d] = [{ o: o, c: c }];
    });
    return out;
  }
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var minToHHMM = function (m) { m = m % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };

  /** رابط صفحة المحل للمشاركة. */
  var shopLink = function (id) { return 'https://zulfi.azyz.site/shop/' + encodeURIComponent(id) + '/'; };

  /** نص باركود بطاقة الولاء (نفس صيغة التطبيق) ويعيد null لغير بطاقاتنا. */
  function parseLoyaltyQr(raw) {
    var m = /^zl1:([A-Za-z0-9_-]{1,80}):([0-9]{6})$/.exec(String(raw || '').trim());
    return m ? { bizId: m[1], code: m[2] } : null;
  }
  var cardBalance = function (c, goal) { return goal > 0 ? (Number(c.stamps) || 0) - (Number(c.redeemed) || 0) * goal : 0; };
  var canStamp = function (c, nowMs) { var t = c.lastStampAt && c.lastStampAt._t; return !t || nowMs - t >= 3 * 3600000; };

  /** رسالة عربية لرمز خطأ الخادم. */
  function errorText(code) {
    var m = {
      too_soon: 'أُضيف طابع لهذا العميل قبل أقل من ٣ ساعات', not_enough: 'لم يكمل العميل طوابع المكافأة', forbidden: 'ليست لديك صلاحية لهذا الإجراء',
      unauthorized: 'انتهت جلستك، سجّل الدخول من جديد', rate_limited: 'محاولات كثيرة، انتظر قليلاً', too_large: 'الحجم كبير', bad_review: 'مدخل غير صالح',
      EMAIL_NOT_FOUND: 'لا يوجد حساب بهذا البريد', INVALID_PASSWORD: 'كلمة المرور غير صحيحة', INVALID_LOGIN_CREDENTIALS: 'البريد أو كلمة المرور غير صحيحة',
      USER_DISABLED: 'هذا الحساب موقوف', TOO_MANY_ATTEMPTS_TRY_LATER: 'محاولات كثيرة، حاول لاحقاً', INVALID_EMAIL: 'البريد غير صالح', MISSING_PASSWORD: 'اكتب كلمة المرور',
    };
    var k = String(code || '');
    for (var key in m) if (k.indexOf(key) === 0) return m[key];
    return 'تعذّر تنفيذ الطلب (' + k + ')';
  }

  var api = { weekOf: weekOf, ar: ar, latin: latin, statsOf: statsOf, diffText: diffText, makeOffer: makeOffer, riyadhDay: riyadhDay, offerState: offerState, makeItem: makeItem, hoursToWire: hoursToWire, minToHHMM: minToHHMM, shopLink: shopLink, parseLoyaltyQr: parseLoyaltyQr, cardBalance: cardBalance, canStamp: canStamp, errorText: errorText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZL = api;
})(typeof window !== 'undefined' ? window : this);
