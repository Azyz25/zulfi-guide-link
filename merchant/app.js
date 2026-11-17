// لوحة التاجر على الويب: تسجيل الدخول ببريد وكلمة مرور حساب التطبيق، وإدارة المحل بنفس واجهة السيرفر التي يستعملها التطبيق.
// لا مكتبات ولا إطار عمل. التوكن يُحفظ في متصفح التاجر فقط ويُجدَّد تلقائياً.
(function () {
  'use strict';
  var ZL = window.ZL;
  var API = 'https://up.azyz.site';
  var KEY = 'AIzaSyD6avj7ImirsX7xdT54WjSX5Wxcp2s2LvQ'; // مفتاح مشروع Firebase العام (نفسه في تطبيق iOS)
  var LS = 'zl_merchant_rt';

  var S = { tok: '', exp: 0, rt: '', uid: '', email: '', claims: {}, shops: [], cur: null, tab: 'stats', msg: null, loy: null };
  try { S.rt = localStorage.getItem(LS) || ''; } catch (_) {}
  // التبويب الابتدائي من الرابط (#offers) ليسهل الرجوع إليه
  (function () { var t = (location.hash || '').slice(1); if (['stats', 'offers', 'menu', 'loyalty', 'info', 'share'].indexOf(t) >= 0) S.tab = t; })();

  // ───── أدوات DOM ─────
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { add(e, x); });
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  var $app = document.getElementById('app');
  function mount(node) { $app.textContent = ''; $app.appendChild(node); }

  // ───── المصادقة (REST لـ Firebase Auth) ─────
  function parseJwt(t) { try { return JSON.parse(decodeURIComponent(escape(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (_) { return {}; } }
  function setSession(idToken, refresh, expiresIn) {
    S.tok = idToken; S.exp = Date.now() + Number(expiresIn || 3600) * 1000; S.rt = refresh || S.rt;
    var c = parseJwt(idToken); S.claims = c; S.uid = c.user_id || c.sub || S.uid; S.email = c.email || S.email;
    try { localStorage.setItem(LS, S.rt); } catch (_) {}
  }
  function authErr(j) { return new Error(ZL.errorText(j && j.error && j.error.message)); }
  function signIn(email, pw) {
    return fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password: pw, returnSecureToken: true }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw authErr(j); setSession(j.idToken, j.refreshToken, j.expiresIn); });
  }
  function resetPassword(email) {
    return fetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: email.trim() }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw authErr(j); });
  }
  function token() {
    if (S.tok && Date.now() < S.exp - 60000) return Promise.resolve(S.tok);
    if (!S.rt) return Promise.reject(new Error('unauthorized'));
    return fetch('https://securetoken.googleapis.com/v1/token?key=' + KEY, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(S.rt) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.error) { signOut(true); throw new Error('unauthorized'); } setSession(j.id_token, j.refresh_token, j.expires_in); return S.tok; });
  }
  function signOut(silent) {
    S.tok = ''; S.rt = ''; S.shops = []; S.cur = null;
    try { localStorage.removeItem(LS); } catch (_) {}
    if (!silent) renderLogin();
  }

  // ───── واجهة السيرفر ─────
  function call(path, opt) {
    opt = opt || {};
    return token().then(function (t) {
      var headers = { Authorization: 'Bearer ' + t };
      var init = { method: opt.method || 'GET', headers: headers };
      if (opt.body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opt.body); }
      return fetch(API + path, init);
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.text().then(function (txt) {
        var j = null; try { j = JSON.parse(txt); } catch (_) {}
        if (!r.ok) throw new Error(ZL.errorText((j && j.error) || 'http_' + r.status));
        return j;
      });
    });
  }
  function write(coll, id, data) { return call('/api/v1/content', { method: 'POST', body: { coll: coll, id: id, action: 'update', data: data } }); }
  function upload(kind, file) {
    return token().then(function (t) {
      var fd = new FormData(); fd.append('file', file, file.name || 'photo.jpg');
      return fetch(API + '/upload?kind=' + kind, { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: fd });
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(ZL.errorText(j.error || 'http_' + r.status)); return j.url; }); });
  }
  function loadShops() {
    return call('/api/v1/me/content/businesses').then(function (j) {
      S.shops = Object.keys(j.docs || {}).map(function (id) { var d = j.docs[id]; d.id = id; return d; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
      if (!S.cur || !S.shops.some(function (s) { return s.id === S.cur; })) S.cur = S.shops.length ? S.shops[0].id : null;
    });
  }
  var shop = function () { return S.shops.filter(function (s) { return s.id === S.cur; })[0]; };
  /** يكتب حقولاً للمحل ثم يحدّث نسخته المحلية. */
  function saveShop(fields) {
    var b = shop();
    return write('businesses', b.id, fields).then(function () { Object.keys(fields).forEach(function (k) { b[k] = fields[k]; }); });
  }

  // ───── رسائل ─────
  function say(kind, text) { S.msg = { kind: kind, text: text }; }
  function msgBox() { return S.msg ? h('div', { class: 'msg ' + S.msg.kind }, S.msg.text) : null; }
  function run(p, ok) {
    return p.then(function (r) { if (ok) say('ok', ok); render(); return r; }).catch(function (e) { say('bad', e.message); render(); });
  }

  // ───── شاشة الدخول ─────
  function renderLogin(note) {
    var email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'البريد الإلكتروني', dir: 'ltr' });
    var pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'كلمة المرور', dir: 'ltr' });
    var out = h('div');
    var go = h('button', { class: 'btn', type: 'submit' }, 'دخول');
    var form = h('form', { onsubmit: function (ev) {
      ev.preventDefault(); go.disabled = true; out.textContent = '';
      signIn(email.value, pw.value).then(start).catch(function (e) { go.disabled = false; out.appendChild(h('div', { class: 'msg bad' }, e.message)); });
    } },
      h('label', null, 'البريد الإلكتروني'), email, h('label', null, 'كلمة المرور'), pw, h('div', { style: 'margin-top:14px' }, go), out);
    var forgot = h('a', { href: '#', onclick: function (ev) {
      ev.preventDefault(); out.textContent = '';
      if (!email.value.trim()) { out.appendChild(h('div', { class: 'msg bad' }, 'اكتب بريدك أولاً')); return; }
      resetPassword(email.value).then(function () { out.appendChild(h('div', { class: 'msg ok' }, 'أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك')); }).catch(function (e) { out.appendChild(h('div', { class: 'msg bad' }, e.message)); });
    } }, 'نسيت كلمة المرور / إنشاء كلمة مرور');
    mount(h('div', { class: 'login' },
      h('img', { class: 'logo', src: '/icon.png', alt: '' }), h('h1', null, 'لوحة التاجر'), h('p', { class: 's' }, 'ادخل بحساب دليل الزلفي المرتبط بمحلك'),
      note ? h('div', { class: 'msg bad' }, note) : null,
      h('div', { class: 'card' }, form, h('p', { class: 'muted', style: 'margin-top:12px' }, forgot)),
      h('p', { class: 'muted' }, 'سجّلت في التطبيق بحساب آبل أو قوقل؟ اضغط «نسيت كلمة المرور» ببريد حسابك لإنشاء كلمة مرور، أو استعمل التطبيق. لم تستلم محلك بعد؟ ابدأ من التطبيق: المزيد ← استلام محلي.'),
      h('p', { class: 'muted' }, h('a', { href: '/merchants/' }, 'ما هي لوحة التاجر؟'), '، ', h('a', { href: '/' }, 'الرئيسية'))));
  }

  // ───── الإطار العام ─────
  var TABS = [['stats', 'الإحصاءات'], ['offers', 'العروض'], ['menu', 'القائمة'], ['loyalty', 'الولاء'], ['info', 'بيانات المحل'], ['share', 'QR والمشاركة']];
  function render() {
    var b = shop();
    if (!b) {
      mount(h('div', null, bar(), h('div', { class: 'wrap' }, msgBox(), h('div', { class: 'card' }, h('h2', null, 'لا يوجد محل مرتبط بحسابك'), h('p', { class: 'muted' }, 'استلم محلك أولاً من التطبيق: المزيد ← استلام محلي. بعد اعتماد الطلب يظهر محلك هنا.'), h('p', null, h('a', { href: '/merchants/' }, 'كيف أستلم محلي؟'))))));
      return;
    }
    var sel = S.shops.length > 1 ? h('select', { onchange: function (e) { S.cur = e.target.value; S.msg = null; S.loy = null; render(); } }, S.shops.map(function (s) { return h('option', { value: s.id, selected: s.id === S.cur }, s.name); })) : h('b', { style: 'font-size:18px' }, b.name);
    var status = { published: ['منشور', 'ok'], rejected: ['مرفوض', ''], pending: ['بانتظار الموافقة', 'warn'] }[b.status] || ['', ''];
    mount(h('div', null, bar(),
      h('div', { class: 'wrap' },
        h('div', { class: 'row sp', style: 'margin-bottom:10px' }, sel, h('span', { class: 'tag ' + status[1] }, status[0])),
        h('div', { class: 'tabs' }, TABS.map(function (t) { return h('button', { class: S.tab === t[0] ? 'on' : '', onclick: function () { S.tab = t[0]; S.msg = null; try { history.replaceState(null, '', '#' + t[0]); } catch (_) {} render(); } }, t[1]); })),
        msgBox(), view(b))));
  }
  function bar() {
    return h('div', { class: 'bar' }, h('div', { class: 'in' }, h('img', { src: '/logo_white.png', alt: '' }), h('b', null, 'لوحة التاجر'),
      h('a', { href: '/', style: 'color:#fff;font-size:14px' }, 'الموقع'), h('button', { onclick: function () { signOut(); } }, 'خروج')));
  }
  function view(b) {
    return { stats: viewStats, offers: viewOffers, menu: viewMenu, loyalty: viewLoyalty, info: viewInfo, share: viewShare }[S.tab](b);
  }

  // ───── الإحصاءات ─────
  function viewStats(b) {
    var st = ZL.statsOf(b, Date.now());
    var tile = function (n, label) { return h('div', { class: 'tile' }, h('b', null, ZL.ar(n)), h('span', null, label)); };
    var peak = st.peak >= 0 ? h('div', { class: 'card' }, h('h3', null, 'ساعات الذروة: أكثر زوارك الساعة ' + ZL.ar(st.peak) + ':٠٠'), h('div', { class: 'bars' }, st.hours.map(function (v, i) { return h('i', { class: i === st.peak ? 'pk' : '', style: 'height:' + (4 + 56 * v / st.peakMax) + 'px' }); }))) : null;
    var verify = b.verified ? h('p', { class: 'tag ok' }, 'محلك موثّق بالشارة الزرقاء')
      : b.verifyRequested ? h('p', { class: 'tag warn' }, 'طلب التوثيق قيد المراجعة')
      : h('div', { class: 'row' }, h('span', { class: 'muted' }, 'الشارة الزرقاء تظهر بجانب اسم محلك وترفع ثقة الزبائن.'), h('button', { class: 'btn s', onclick: function () { run(saveShop({ verifyRequested: true }), 'أُرسل طلب التوثيق للمراجعة'); } }, 'اطلب التوثيق'));
    var replies = b.replies || {};
    var reviews = (b.reviews || []).slice().sort(function (x, y) { return ((y.at && y.at._t) || 0) - ((x.at && x.at._t) || 0); });
    return h('div', null,
      h('div', { class: 'grid' }, tile(st.views, 'مشاهدات المحل'), tile(st.calls, 'ضغطات الاتصال'), tile(st.whatsapp, 'ضغطات واتساب'), tile(st.directions, 'ضغطات الاتجاهات')),
      h('div', { class: 'card' }, h('p', null, st.views === 0 ? 'ستظهر هنا نسبة الزوار الذين تواصلوا معك' : 'تواصل معك ' + ZL.ar(st.conversion) + '٪ من زوار محلك (' + ZL.ar(st.acts) + ' تواصل من ' + ZL.ar(st.views) + ' مشاهدة)')),
      h('div', { class: 'card' }, h('h3', null, 'تقرير الأسبوع'), h('div', { class: 'grid', style: 'margin:8px 0 0' },
        h('div', null, h('b', { style: 'font-size:24px' }, ZL.ar(st.weekViews)), h('div', { class: 'muted' }, 'مشاهدات، ' + ZL.diffText(st.weekViews, st.prevWeekViews) + ' عن الماضي')),
        h('div', null, h('b', { style: 'font-size:24px' }, ZL.ar(st.weekActs)), h('div', { class: 'muted' }, 'تواصل، ' + ZL.diffText(st.weekActs, st.prevWeekActs) + ' عن الماضي')))),
      peak, h('div', { class: 'card' }, verify),
      h('div', { class: 'card' }, h('h2', null, st.ratingCount ? 'متوسط التقييم ' + ZL.ar(st.rating.toFixed(1)) + ' من ' + ZL.ar(st.ratingCount) + ' تقييم' : 'لا توجد تقييمات بعد'),
        reviews.map(function (r) {
          var key = String(r.at && r.at._t), rep = replies[key] || r.reply;
          var box = h('div', null);
          if (rep) box.appendChild(h('p', { class: 'muted' }, 'ردك: ' + rep));
          else {
            var ta = h('textarea', { placeholder: 'ردك على التقييم' });
            box.appendChild(h('div', { class: 'row' }, ta, h('button', { class: 'btn s', onclick: function () { if (!ta.value.trim()) return; var d = {}; d['replies.' + key] = ta.value.trim(); run(write('businesses', b.id, d).then(function () { b.replies = b.replies || {}; b.replies[key] = ta.value.trim(); }), 'نُشر ردك'); } }, 'نشر الرد')));
          }
          return h('div', { class: 'item', style: 'flex-direction:column;align-items:stretch' }, h('div', null, h('b', null, r.author || 'زائر'), ' ', h('span', { class: 'stars' }, new Array((r.rating || 0) + 1).join('★'))), r.text ? h('p', null, r.text) : null, box);
        })));
  }

  // ───── العروض ─────
  function viewOffers(b) {
    var f = { title: h('input', { placeholder: 'نص العرض، مثال: خصم 20% على الوجبات' }), discount: h('input', { placeholder: 'قيمة الخصم (مثل 20٪ أو 50 ر.س)' }), description: h('textarea', { placeholder: 'تفاصيل العرض (اختياري)' }),
      start: h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) }), end: h('input', { type: 'date', value: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }),
      minOrder: h('input', { placeholder: 'أقل قيمة للطلب بالريال (اختياري)', inputmode: 'numeric' }), code: h('input', { placeholder: 'كود الخصم (اختياري)', dir: 'ltr' }), terms: h('input', { placeholder: 'شروط العرض (اختياري)' }) };
    var img = ''; var imgNote = h('span', { class: 'muted' });
    var file = h('input', { type: 'file', accept: 'image/*', onchange: function () {
      if (!file.files[0]) return; imgNote.textContent = 'جارٍ رفع الصورة…';
      upload('shop', file.files[0]).then(function (u) { img = u; imgNote.textContent = 'تم رفع الصورة'; }).catch(function (e) { imgNote.textContent = e.message; });
    } });
    var now = Date.now();
    var list = (b.offers || []).map(function (o, i) {
      var st = ZL.offerState(o, now);
      var d = function (t) { return new Date(t).toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh' }); };
      return h('div', { class: 'item' }, h('div', { class: 't' }, h('b', null, o.title), h('div', { class: 'muted' }, 'من ' + d(o.start._t) + ' إلى ' + d(o.end._t) + (o.minOrder ? '، أقل طلب ' + ZL.ar(o.minOrder) + ' ر.س' : '') + (o.code ? '، الكود ' + o.code : ''))),
        h('span', { class: 'tag ' + (st === 'active' ? 'ok' : st === 'upcoming' ? 'warn' : '') }, { active: 'فعّال', upcoming: 'مجدول', ended: 'منتهٍ' }[st]),
        h('button', { class: 'btn d s', onclick: function () { if (!confirm('حذف هذا العرض؟')) return; var next = b.offers.slice(); next.splice(i, 1); run(saveShop({ offers: next }), 'تم حذف العرض'); } }, 'حذف'));
    });
    return h('div', null,
      h('div', { class: 'card' }, h('h2', null, 'عرض جديد مجدول'),
        h('label', null, 'نص العرض'), f.title, h('label', null, 'الخصم'), f.discount, h('label', null, 'التفاصيل'), f.description,
        h('div', { class: 'grid' }, h('div', null, h('label', null, 'يبدأ'), f.start), h('div', null, h('label', null, 'ينتهي'), f.end)),
        h('div', { class: 'grid' }, h('div', null, h('label', null, 'أقل طلب'), f.minOrder), h('div', null, h('label', null, 'الكود'), f.code)),
        h('label', null, 'الشروط'), f.terms, h('label', null, 'صورة العرض (اختياري)'), file, imgNote,
        h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: function () {
          var o; try { o = ZL.makeOffer({ title: f.title.value, discount: f.discount.value, description: f.description.value, start: ZL.riyadhDay(f.start.value, false), end: ZL.riyadhDay(f.end.value, true), minOrder: f.minOrder.value, code: f.code.value, terms: f.terms.value, image: img }); } catch (e) { say('bad', e.message); return render(); }
          run(saveShop({ offers: [o].concat(b.offers || []) }), 'تم نشر العرض');
        } }, 'نشر العرض'))),
      h('div', { class: 'card' }, h('h2', null, 'عروضك'), list.length ? list : h('p', { class: 'muted' }, 'لا توجد عروض')));
  }

  // ───── القائمة ─────
  function viewMenu(b) {
    var menu = JSON.parse(JSON.stringify(b.menu || []));
    var commit = function (ok) { return run(saveShop({ menu: menu }), ok); };
    var secName = h('input', { placeholder: 'اسم قسم جديد، مثل: المشروبات' });
    var blocks = menu.map(function (sec, si) {
      var n = h('input', { placeholder: 'اسم الصنف' }), p = h('input', { placeholder: 'السعر', inputmode: 'decimal', style: 'max-width:110px' }), ds = h('input', { placeholder: 'وصف قصير (اختياري)' });
      return h('div', { class: 'card' },
        h('div', { class: 'row sp' }, h('h2', null, sec.title), h('button', { class: 'btn d s', onclick: function () { if (!confirm('حذف القسم وأصنافه؟')) return; menu.splice(si, 1); commit('تم حذف القسم'); } }, 'حذف القسم')),
        (sec.items || []).map(function (it, ii) {
          var price = h('input', { value: String(it.price), inputmode: 'decimal', style: 'max-width:90px', onchange: function (e) { var v = Number(ZL.latin(e.target.value)); if (isFinite(v) && v >= 0) { it.price = v; commit('تم تحديث السعر'); } } });
          return h('div', { class: 'item' }, h('div', { class: 't' }, h('b', null, it.name), it.description ? h('div', { class: 'muted' }, it.description) : null), price, h('span', { class: 'muted' }, 'ر.س'),
            h('button', { class: 'btn o s', onclick: function () { it.available = it.available === false; commit(it.available ? 'الصنف متاح الآن' : 'تم إيقاف الصنف'); } }, it.available === false ? 'متوقف' : 'متاح'),
            h('button', { class: 'btn d s', onclick: function () { sec.items.splice(ii, 1); commit('تم حذف الصنف'); } }, 'حذف'));
        }),
        h('div', { class: 'row', style: 'margin-top:10px' }, n, p, ds, h('button', { class: 'btn s', onclick: function () {
          var it; try { it = ZL.makeItem({ name: n.value, price: p.value, description: ds.value }); } catch (e) { say('bad', e.message); return render(); }
          sec.items = sec.items || []; sec.items.push(it); commit('تمت إضافة الصنف');
        } }, 'إضافة صنف')));
    });
    return h('div', null, h('div', { class: 'card' }, h('h2', null, 'قسم جديد'), h('div', { class: 'row' }, secName, h('button', { class: 'btn', onclick: function () {
      var t = secName.value.trim(); if (!t) { say('bad', 'اكتب اسم القسم'); return render(); }
      menu.push({ title: t, items: [] }); commit('تمت إضافة القسم');
    } }, 'إضافة'))), blocks.length ? blocks : h('p', { class: 'muted' }, 'لا توجد أقسام بعد'));
  }

  // ───── الولاء ─────
  function viewLoyalty(b) {
    var lo = b.loyalty || {};
    var on = h('input', { type: 'checkbox', checked: lo.on === true });
    var goal = h('input', { value: lo.goal ? String(lo.goal) : '8', inputmode: 'numeric', style: 'max-width:120px' });
    var reward = h('input', { value: lo.reward || '', placeholder: 'المكافأة، مثل: قهوة مجانية' });
    var cfg = h('div', { class: 'card' }, h('h2', null, 'برنامج الولاء'), h('p', { class: 'muted' }, 'كل زيارة طابع، وعند اكتمال العدد يأخذ العميل مكافأته منك.'),
      h('label', null, on, ' تشغيل البرنامج'), h('label', null, 'عدد الطوابع للمكافأة (من ٢ إلى ٣٠)'), goal, h('label', null, 'المكافأة'), reward,
      h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: function () {
        var g = parseInt(ZL.latin(goal.value), 10), r = reward.value.trim();
        if (on.checked && (!(g >= 2 && g <= 30) || !r)) { say('bad', 'اكتب عدد طوابع من ٢ إلى ٣٠ ومكافأة واضحة'); return render(); }
        run(saveShop({ loyalty: { on: on.checked, goal: g || 0, reward: r } }), 'تم حفظ برنامج الولاء');
      } }, 'حفظ')));
    if (!(lo.on && lo.goal >= 2 && lo.reward)) return h('div', null, cfg);

    var code = h('input', { placeholder: 'رمز العميل (٦ أرقام)', inputmode: 'numeric', dir: 'ltr' });
    var out = h('div');
    function cards() { return call('/api/v1/loyalty/shop/' + encodeURIComponent(b.id)).then(function (j) { S.loy = Object.keys(j.docs || {}).map(function (id) { var d = j.docs[id]; d.id = id; return d; }); return S.loy; }); }
    function show(card) {
      out.textContent = '';
      var bal = ZL.cardBalance(card, lo.goal), prog = Math.max(0, Math.min(lo.goal, bal)), ready = bal >= lo.goal;
      var dots = h('div', { class: 'dots' }); for (var i = 0; i < lo.goal; i++) dots.appendChild(h('i', { class: i < prog ? 'f' : '' }));
      var act = function (data, ok) { write('loyalty', card.id, data).then(function () { return cards(); }).then(function () { var c = S.loy.filter(function (x) { return x.id === card.id; })[0]; show(c || card); out.appendChild(h('div', { class: 'msg ok' }, ok)); }).catch(function (e) { out.appendChild(h('div', { class: 'msg bad' }, e.message)); }); };
      out.appendChild(h('div', { class: 'card loy' }, h('b', null, (card.name || 'عميل') + ': ' + ZL.ar(prog) + ' من ' + ZL.ar(lo.goal)), dots,
        h('div', { class: 'row' },
          h('button', { class: 'btn o s', disabled: !ZL.canStamp(card, Date.now()), onclick: function () { act({ stamps: { $inc: 1 }, lastStampAt: { $now: true } }, 'تمت إضافة الطابع'); } }, 'إضافة طابع'),
          h('button', { class: 'btn o s', disabled: !ready, onclick: function () { act({ redeemed: { $inc: 1 } }, 'تم تسجيل استبدال ' + lo.reward); } }, 'استبدال المكافأة')),
        !ZL.canStamp(card, Date.now()) ? h('p', { style: 'margin-top:6px;font-size:14px' }, 'أُضيف طابع لهذا العميل قبل أقل من ٣ ساعات') : null));
    }
    function lookup(c) {
      out.textContent = '';
      cards().then(function () {
        var q = ZL.latin(c).trim();
        var card = S.loy.filter(function (x) { return x.code === q; })[0];
        if (!card) return out.appendChild(h('div', { class: 'msg bad' }, 'لا توجد بطاقة بهذا الرمز'));
        show(card);
      }).catch(function (e) { out.appendChild(h('div', { class: 'msg bad' }, e.message)); });
    }
    var tools = h('div', { class: 'card' }, h('h2', null, 'إضافة طابع'), h('p', { class: 'muted' }, 'امسح باركود بطاقة العميل من تطبيقه، أو اكتب رمزه.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { scanQr(function (raw) {
        var q = ZL.parseLoyaltyQr(raw);
        if (!q) return out.appendChild(h('div', { class: 'msg bad' }, 'هذا ليس باركود بطاقة ولاء من دليل الزلفي'));
        if (q.bizId !== b.id) return out.appendChild(h('div', { class: 'msg bad' }, 'هذه بطاقة محل آخر'));
        code.value = q.code; lookup(q.code);
      }); } }, 'مسح الباركود بالكاميرا')),
      h('div', { class: 'row', style: 'margin-top:10px' }, code, h('button', { class: 'btn o', onclick: function () { lookup(code.value); } }, 'بحث بالرمز')), out);
    var count = h('p', { class: 'muted' }, '');
    cards().then(function () { count.textContent = ZL.ar(S.loy.length) + ' عميل في البرنامج'; }).catch(function () {});
    return h('div', null, tools, cfg, count);
  }

  /** مسح QR بالكاميرا: BarcodeDetector إن وُجد، وإلا jsQR (يُحمَّل عند الحاجة). */
  function scanQr(onResult) {
    var video = h('video', { autoplay: true, playsinline: true, muted: true });
    var note = h('p', null, 'وجّه الكاميرا إلى باركود بطاقة العميل');
    var stream = null, stopped = false;
    var layer = h('div', { class: 'scan' }, video, note, h('button', { class: 'btn', onclick: close }, 'إغلاق'));
    function close() { stopped = true; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); layer.remove(); }
    document.body.appendChild(layer);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { note.textContent = 'متصفحك لا يدعم الكاميرا. اكتب رمز العميل يدوياً.'; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
      stream = s; video.srcObject = s; video.play();
      var detect;
      if ('BarcodeDetector' in window) {
        var bd = new window.BarcodeDetector({ formats: ['qr_code'] });
        detect = function () { return bd.detect(video).then(function (r) { return r.length ? r[0].rawValue : null; }); };
        loop();
      } else {
        var sc = document.createElement('script');
        sc.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; sc.integrity = 'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx'; sc.crossOrigin = 'anonymous';
        sc.onload = function () {
          var cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
          detect = function () {
            if (!video.videoWidth) return Promise.resolve(null);
            cv.width = video.videoWidth; cv.height = video.videoHeight; cx.drawImage(video, 0, 0);
            var d = cx.getImageData(0, 0, cv.width, cv.height), r = window.jsQR(d.data, d.width, d.height);
            return Promise.resolve(r ? r.data : null);
          };
          loop();
        };
        sc.onerror = function () { note.textContent = 'تعذّر تحميل قارئ الباركود. اكتب رمز العميل يدوياً.'; };
        document.head.appendChild(sc);
      }
      function loop() {
        if (stopped) return;
        detect().then(function (v) { if (v) { close(); onResult(v); } else setTimeout(loop, 250); }).catch(function () { setTimeout(loop, 400); });
      }
    }).catch(function () { note.textContent = 'تعذّر تشغيل الكاميرا. اسمح بها من إعدادات المتصفح، أو اكتب الرمز يدوياً.'; });
  }

  // ───── بيانات المحل ─────
  function viewInfo(b) {
    var f = { name: h('input', { value: b.name || '' }), phone: h('input', { value: b.phone || '', dir: 'ltr', inputmode: 'tel' }), whatsapp: h('input', { value: b.whatsapp || '', dir: 'ltr', inputmode: 'tel', placeholder: '9665XXXXXXXX' }),
      website: h('input', { value: b.website || '', dir: 'ltr', placeholder: 'https://' }), address: h('input', { value: b.address || '' }), description: h('textarea', null, b.description || '') };
    var days = { 7: 'الأحد', 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' };
    var hrs = b.hours || {}, rows = {};
    var hoursUi = Object.keys(days).map(function (d) {
      var sh = (hrs[d] && hrs[d][0]) || null;
      var o = h('input', { type: 'time', value: sh ? ZL.minToHHMM(sh.o) : '09:00' }), c = h('input', { type: 'time', value: sh ? ZL.minToHHMM(sh.c) : '22:00' });
      var off = h('input', { type: 'checkbox', checked: b.hoursKnown ? !sh : false });
      rows[d] = { o: o, c: c, off: off };
      return h('div', { class: 'hours', style: 'margin-bottom:6px' }, h('b', null, days[d]), o, c, h('label', { style: 'margin:0;font-weight:500' }, off, ' مغلق'));
    });
    var known = h('input', { type: 'checkbox', checked: b.hoursKnown === true });
    var photos = (b.photos || []).slice(), logo = b.logo || '';
    var photosBox = h('div', { class: 'photos' }), logoNote = h('span', { class: 'muted' }, logo ? 'الشعار مرفوع' : 'لا يوجد شعار');
    function drawPhotos() {
      photosBox.textContent = '';
      photos.forEach(function (u, i) { photosBox.appendChild(h('div', null, h('img', { src: u, alt: '' }), h('button', { onclick: function () { photos.splice(i, 1); drawPhotos(); } }, '×'))); });
    }
    drawPhotos();
    var logoFile = h('input', { type: 'file', accept: 'image/*', onchange: function () { if (!logoFile.files[0]) return; logoNote.textContent = 'جارٍ الرفع…'; upload('logo', logoFile.files[0]).then(function (u) { logo = u; logoNote.textContent = 'تم رفع الشعار (احفظ ليظهر)'; }).catch(function (e) { logoNote.textContent = e.message; }); } });
    var photoNote = h('span', { class: 'muted' });
    var photoFile = h('input', { type: 'file', accept: 'image/*', multiple: true, onchange: function () {
      var files = Array.prototype.slice.call(photoFile.files, 0, 8 - photos.length); if (!files.length) return; photoNote.textContent = 'جارٍ الرفع…';
      files.reduce(function (p, fl) { return p.then(function () { return upload('shop', fl).then(function (u) { photos.push(u); drawPhotos(); }); }); }, Promise.resolve()).then(function () { photoNote.textContent = 'تم الرفع (احفظ ليظهر)'; }).catch(function (e) { photoNote.textContent = e.message; });
    } });
    return h('div', null,
      h('div', { class: 'card' }, h('h2', null, 'بيانات المحل'),
        h('label', null, 'الاسم'), f.name, h('label', null, 'رقم الاتصال'), f.phone, h('label', null, 'رقم الواتساب'), f.whatsapp, h('label', null, 'الموقع الإلكتروني'), f.website, h('label', null, 'العنوان'), f.address, h('label', null, 'الوصف'), f.description),
      h('div', { class: 'card' }, h('h2', null, 'ساعات الدوام'), h('label', null, known, ' ساعات دوامي معروفة وأريد إظهارها'), hoursUi),
      h('div', { class: 'card' }, h('h2', null, 'الشعار والصور'), logo ? h('img', { src: logo, alt: '', style: 'width:70px;border-radius:12px' }) : null, h('label', null, 'الشعار'), logoFile, logoNote, h('label', null, 'صور المحل (حتى ٨)'), photosBox, photoFile, photoNote),
      h('div', null, h('button', { class: 'btn', onclick: function () {
        var web = f.website.value.trim();
        if (web && !/^https:\/\//.test(web)) { say('bad', 'رابط الموقع يجب أن يبدأ بـ https://'); return render(); }
        if (!f.name.value.trim()) { say('bad', 'اكتب اسم المحل'); return render(); }
        var data = { name: f.name.value.trim(), phone: ZL.latin(f.phone.value).trim(), whatsapp: ZL.latin(f.whatsapp.value).trim(), website: web, address: f.address.value.trim(), description: f.description.value.trim(), logo: logo, photos: photos, hoursKnown: known.checked };
        var wire = {}; Object.keys(rows).forEach(function (d) { wire[d] = { o: rows[d].o.value, c: rows[d].c.value, off: rows[d].off.checked }; });
        data.hours = ZL.hoursToWire(wire);
        run(saveShop(data), 'تم حفظ البيانات');
      } }, 'حفظ التعديلات')));
  }

  // ───── QR والمشاركة ─────
  function viewShare(b) {
    var link = ZL.shopLink(b.id);
    var holder = h('div', { class: 'qr' }, h('span', { class: 'muted' }, 'جارٍ إنشاء الرمز…'));
    var sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; sc.integrity = 'sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1'; sc.crossOrigin = 'anonymous';
    function draw() {
      var q = window.qrcode(0, 'H'); q.addData(link); q.make();
      var n = q.getModuleCount(), px = 8, size = n * px, cv = document.createElement('canvas'); cv.width = cv.height = size;
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size); cx.fillStyle = '#8F4E27';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) cx.fillRect(c * px, r * px, px, px);
      cv.style.width = '240px'; cv.style.height = '240px';
      holder.textContent = ''; holder.appendChild(cv); holder.appendChild(h('b', null, b.name));
      holder.appendChild(h('a', { class: 'btn o s', download: 'zulfi-' + b.id + '.png', href: cv.toDataURL('image/png') }, 'تنزيل الصورة للطباعة'));
    }
    if (window.qrcode) draw(); else { sc.onload = draw; sc.onerror = function () { holder.textContent = 'تعذّر إنشاء الرمز. استخدم الرابط أدناه.'; }; document.head.appendChild(sc); }
    var copy = h('button', { class: 'btn o s', onclick: function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { copy.textContent = 'تم النسخ'; }).catch(function () { prompt('انسخ الرابط', link); }); } }, 'نسخ الرابط');
    return h('div', null, h('div', { class: 'card' }, h('h2', null, 'رمز QR لمحلك'), h('p', { class: 'muted' }, 'اطبعه على الباب أو الكاونتر: من يمسحه يفتح صفحة محلك ويحمّل التطبيق.'), holder),
      h('div', { class: 'card' }, h('h2', null, 'رابط محلك'), h('p', { dir: 'ltr', style: 'word-break:break-all' }, link),
        h('div', { class: 'row' }, copy, h('a', { class: 'btn s', style: 'background:#1FA855', href: 'https://wa.me/?text=' + encodeURIComponent('تفضلوا بزيارة ' + b.name + ' في دليل الزلفي\n' + link), target: '_blank', rel: 'noopener' }, 'مشاركة عبر واتساب'))));
  }

  // ───── البدء ─────
  function start() {
    mount(h('p', { class: 'boot' }, 'جارٍ تحميل محلاتك…'));
    return loadShops().then(function () { S.msg = null; render(); }).catch(function (e) { if (!S.rt) renderLogin(e.message); else { say('bad', e.message); render(); } });
  }
  if (S.rt) token().then(start).catch(function () { renderLogin(); }); else renderLogin();
})();
