/* 금견적 — 금은방 매입 견적 카드 (vanilla JS, 백엔드 없음, localStorage 저장) */
(() => {
  'use strict';

  const KEY = 'geumgyeonjeok.v1';
  const DON = 3.75; // 1돈 = 3.75g
  const TZ = 'Asia/Seoul';
  const ITEM_NAMES = ['반지', '목걸이', '팔찌', '귀걸이', '돌반지', '골드바', '금수저', '금거북이', '금니', '기타'];
  const STATUS = [
    { id: 'sent', label: '발송됨' },
    { id: 'visited', label: '방문' },
    { id: 'bought', label: '매입완료' },
    { id: 'lost', label: '미방문' }
  ];
  const DEFAULT_PURITIES = [
    { id: '24K', label: '24K 순금', content: 100, rate: 100, override: null },
    { id: '22K', label: '22K', content: 91.7, rate: 95, override: null },
    { id: '18K', label: '18K', content: 75, rate: 95, override: null },
    { id: '14K', label: '14K', content: 58.5, rate: 95, override: null }
  ];
  const DEFAULT_NOTE = '실물 순도·중량 확인 후 최종 확정됩니다.\n유효시간 내 방문 시 위 단가로 매입해 드립니다.';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => `${Math.round(Number(n) || 0).toLocaleString('ko-KR')}원`;
  const fmtG = (g) => `${(Math.round(g * 100) / 100).toFixed(2)}g`;
  const money = (s) => { const n = parseInt(String(s ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
  const decimal = (s) => { const n = parseFloat(String(s ?? '').replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };

  const dtf = new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const partsOf = (ms) => {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    if (p.hour === '24') p.hour = '00';
    return p;
  };
  const fmtDT = (ms) => {
    const p = {}; dtf.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    const h = p.hour === '24' ? '00' : p.hour;
    return `${p.month}/${p.day}(${p.weekday}) ${h}:${p.minute}`;
  };
  const fmtHM = (ms) => { const p = partsOf(ms); return `${p.hour}:${p.minute}`; };

  // ---------- 상태 ----------
  const fresh = () => ({
    shop: { name: '', phone: '', address: '', kakao: '', note: DEFAULT_NOTE, rounding: 100, valid: '120', close: '20:00' },
    price: { base: 0, updatedAt: null },
    purities: DEFAULT_PURITIES.map((p) => ({ ...p })),
    draft: { customer: '', memo: '', valid: null, items: [newItem()] },
    history: [],
    seq: { day: '', n: 0 }
  });
  function newItem(o = {}) { return { id: uid(), name: '', purity: '18K', weight: '', unit: 'g', deduct: '', ...o }; }

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      const s = JSON.parse(raw);
      const f = fresh();
      return { ...f, ...s, shop: { ...f.shop, ...(s.shop || {}) }, price: { ...f.price, ...(s.price || {}) }, draft: { ...f.draft, ...(s.draft || {}) }, purities: Array.isArray(s.purities) && s.purities.length ? s.purities : f.purities, history: Array.isArray(s.history) ? s.history : [] };
    } catch (e) { console.warn('저장 데이터 복구 실패, 초기화합니다.', e); return fresh(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('저장 공간이 부족합니다. 오래된 기록을 삭제해 주세요.'); }
  }

  // ---------- 계산 ----------
  function unitPrice(pid, st = state) {
    const p = st.purities.find((x) => x.id === pid);
    if (!p) return 0;
    if (p.override) return p.override;
    return Math.floor((st.price.base || 0) * (p.content / 100) * (p.rate / 100));
  }
  function roundDown(n) { const r = Number(state.shop.rounding) || 1; return Math.floor(n / r) * r; }
  function calcItem(it) {
    const w = decimal(it.weight);
    const grams = it.unit === '돈' ? w * DON : w;
    const ded = decimal(it.deduct);
    const net = grams - ded;
    const unit = unitPrice(it.purity);
    let error = '';
    if (!w) error = '중량을 입력하세요';
    else if (ded < 0 || net <= 0) error = '공제 중량이 총중량보다 크거나 같습니다';
    const price = error ? 0 : roundDown((net / DON) * unit);
    return { grams, ded, net: Math.max(net, 0), unit, price, error };
  }

  // ---------- 탭 ----------
  function goto(tab) {
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${tab}`));
    $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'history') renderHistory();
    if (tab === 'price') renderPrice();
    if (tab === 'settings') renderSettings();
    window.scrollTo({ top: 0 });
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-goto]');
    if (t) goto(t.dataset.tab || t.dataset.goto);
  });

  // ---------- 상단바 ----------
  function renderTop() {
    $('#topShop').textContent = state.shop.name || '매장명을 설정하세요';
    $('#topPrice').textContent = state.price.base ? `순금 1돈 ${won(state.price.base)}` : '시세 미입력';
    $('#onboarding').hidden = Boolean(state.shop.name && state.price.base);
  }

  // ---------- 견적 작성 ----------
  function purityOptions(sel) {
    return state.purities.map((p) => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
  }
  function renderItems() {
    const wrap = $('#items');
    wrap.innerHTML = state.draft.items.map((it, i) => {
      const c = calcItem(it);
      return `<div class="card item" data-id="${it.id}">
        <div class="item-head"><strong>품목 ${i + 1}</strong>
          <div class="row gap"><span class="item-price" data-role="price">${c.error ? '-' : won(c.price)}</span>
          <button type="button" class="icon-btn" data-act="del" aria-label="품목 ${i + 1} 삭제"${state.draft.items.length === 1 ? ' disabled' : ''}>🗑</button></div>
        </div>
        <div class="grid2">
          <label class="field"><span>품목명</span><input data-k="name" list="itemNames" maxlength="16" placeholder="반지" value="${esc(it.name)}" /></label>
          <label class="field"><span>순도</span><select data-k="purity">${purityOptions(it.purity)}</select></label>
        </div>
        <div class="grid3">
          <label class="field"><span>중량</span><input data-k="weight" inputmode="decimal" placeholder="0.00" value="${esc(it.weight)}" /></label>
          <div class="field"><span>단위</span><div class="seg" role="group" aria-label="중량 단위">
            <button type="button" data-unit="g" class="${it.unit === 'g' ? 'on' : ''}">g</button>
            <button type="button" data-unit="돈" class="${it.unit === '돈' ? 'on' : ''}">돈</button></div></div>
          <label class="field"><span>보석 공제(g)</span><input data-k="deduct" inputmode="decimal" placeholder="0" value="${esc(it.deduct)}" /></label>
        </div>
        <p class="err" data-role="err"></p>
        <p class="hint" data-role="detail"></p>
      </div>`;
    }).join('') + `<datalist id="itemNames">${ITEM_NAMES.map((n) => `<option value="${n}">`).join('')}</datalist>`;
    state.draft.items.forEach((it) => updateItemUI(it));
    renderTotal();
  }
  function updateItemUI(it, showErr = false) {
    const el = $(`.item[data-id="${it.id}"]`);
    if (!el) return;
    const c = calcItem(it);
    $('[data-role="price"]', el).textContent = c.error ? '-' : won(c.price);
    $('[data-role="detail"]', el).textContent = c.error ? `1돈 단가 ${won(c.unit)}` : `실중량 ${fmtG(c.net)} (${(c.net / DON).toFixed(2)}돈) × 1돈 ${won(c.unit)}`;
    const errEl = $('[data-role="err"]', el);
    const bad = showErr && c.error;
    errEl.textContent = bad ? c.error : (c.error && c.error.startsWith('공제') ? c.error : '');
    $('[data-k="weight"]', el).classList.toggle('invalid', Boolean(bad && c.error.includes('중량을')));
    $('[data-k="deduct"]', el).classList.toggle('invalid', Boolean(c.error && c.error.startsWith('공제')));
  }
  function renderTotal() {
    const total = state.draft.items.reduce((s, it) => s + calcItem(it).price, 0);
    $('#qTotal').textContent = won(total);
  }
  $('#items').addEventListener('input', (e) => {
    const el = e.target.closest('.item'); const k = e.target.dataset.k;
    if (!el || !k) return;
    const it = state.draft.items.find((x) => x.id === el.dataset.id);
    it[k] = e.target.value;
    updateItemUI(it); renderTotal(); save();
  });
  $('#items').addEventListener('change', (e) => {
    const el = e.target.closest('.item');
    if (el && e.target.dataset.k === 'purity') { const it = state.draft.items.find((x) => x.id === el.dataset.id); it.purity = e.target.value; updateItemUI(it); renderTotal(); save(); }
  });
  $('#items').addEventListener('click', (e) => {
    const el = e.target.closest('.item'); if (!el) return;
    const it = state.draft.items.find((x) => x.id === el.dataset.id);
    const ub = e.target.closest('[data-unit]');
    if (ub) { it.unit = ub.dataset.unit; $$('[data-unit]', el).forEach((b) => b.classList.toggle('on', b === ub)); updateItemUI(it); renderTotal(); save(); }
    if (e.target.closest('[data-act="del"]') && state.draft.items.length > 1) {
      state.draft.items = state.draft.items.filter((x) => x.id !== it.id); renderItems(); save();
    }
  });
  $('#btnAddItem').addEventListener('click', () => {
    const last = state.draft.items[state.draft.items.length - 1];
    state.draft.items.push(newItem({ purity: last ? last.purity : '18K' }));
    renderItems(); save();
    const inputs = $$('.item [data-k="name"]'); inputs[inputs.length - 1].focus();
  });
  $('#qCustomer').addEventListener('input', (e) => { state.draft.customer = e.target.value; save(); });
  $('#qMemo').addEventListener('input', (e) => { state.draft.memo = e.target.value; save(); });
  $('#qValid').addEventListener('change', (e) => { state.draft.valid = e.target.value; save(); });

  function validUntil(from, v) {
    if (v === 'eod') {
      const [hh, mm] = (state.shop.close || '20:00').split(':').map(Number);
      const day = 86400000, off = 9 * 3600000;
      const start = Math.floor((from + off) / day) * day - off;
      let t = start + (hh * 60 + mm) * 60000;
      if (t <= from) t = start + day - 60000; // 이미 영업 종료 후라면 오늘 23:59
      return t;
    }
    return from + (Number(v) || 120) * 60000;
  }
  function nextQuoteId(now) {
    const p = partsOf(now); const day = `${p.year}${p.month}${p.day}`;
    if (state.seq.day !== day) state.seq = { day, n: 0 };
    state.seq.n += 1;
    return `Q${day}-${String(state.seq.n).padStart(3, '0')}`;
  }

  $('#btnMakeCard').addEventListener('click', () => {
    if (!state.shop.name) { toast('먼저 설정에서 매장명을 입력하세요'); goto('settings'); $('#sName').focus(); return; }
    if (!state.price.base) { toast('오늘 순금 1돈 매입가를 먼저 입력하세요'); goto('price'); $('#pBase').focus(); return; }
    let bad = false;
    state.draft.items.forEach((it) => { if (calcItem(it).error) { bad = true; updateItemUI(it, true); } });
    if (bad) { toast('빨간 칸을 확인해 주세요'); const f = $('.item input.invalid'); if (f) f.focus(); return; }
    const now = Date.now();
    const items = state.draft.items.map((it) => {
      const c = calcItem(it);
      const p = state.purities.find((x) => x.id === it.purity);
      return { name: it.name.trim() || '금 제품', purity: p ? p.label : it.purity, grams: +c.grams.toFixed(2), ded: +c.ded.toFixed(2), net: +c.net.toFixed(2), unit: c.unit, price: c.price };
    });
    const q = {
      v: 1, id: nextQuoteId(now), t: now, u: validUntil(now, state.draft.valid || state.shop.valid),
      shop: { name: state.shop.name, phone: state.shop.phone, address: state.shop.address, kakao: state.shop.kakao },
      base: state.price.base, baseAt: state.price.updatedAt, items,
      total: items.reduce((s, x) => s + x.price, 0), customer: state.draft.customer.trim(), memo: state.draft.memo.trim(),
      note: state.shop.note, status: 'sent'
    };
    state.history.unshift(q);
    state.history = state.history.slice(0, 300);
    save();
    openPreview(q);
  });

  // ---------- 견적 카드 (HTML) ----------
  function cardHTML(q) {
    const rows = q.items.map((x) => `<div class="qc-row"><span class="n">${esc(x.name)} · ${esc(x.purity)}</span>
      <span class="d">${x.ded ? `${fmtG(x.grams)} − 공제 ${fmtG(x.ded)} = ` : ''}${fmtG(x.net)} · 1돈 ${won(x.unit)}</span><span class="p">${won(x.price)}</span></div>`).join('');
    return `<article class="qcard" data-quote="${esc(q.id)}">
      <div class="qc-head"><div class="qc-shop">${esc(q.shop.name)}</div><div class="qc-title">금 매입 견적서${q.customer ? ` · ${esc(q.customer)}` : ''}</div>
        <div class="qc-meta"><span>No. ${esc(q.id)}</span><span>발행 ${fmtDT(q.t)}</span></div></div>
      <div class="qc-valid">⏰ ${fmtDT(q.u)}까지 이 단가로 매입</div>
      <div class="qc-body">${rows}
        <div class="qc-total"><span>예상 매입 합계</span><strong data-role="total">${won(q.total)}</strong></div>
        <div class="qc-base">기준 시세: 순금 1돈 ${won(q.base)}${q.baseAt ? ` (${fmtDT(q.baseAt)} 기준)` : ''}</div>
        ${q.memo ? `<div class="qc-note">📝 ${esc(q.memo)}</div>` : ''}
        ${q.note ? `<div class="qc-note">${esc(q.note)}</div>` : ''}
      </div>
      <div class="qc-foot">${q.shop.phone ? `<div>☎ ${esc(q.shop.phone)}</div>` : ''}${q.shop.address ? `<div>📍 ${esc(q.shop.address)}</div>` : ''}</div>
    </article>`;
  }
  let current = null;
  function openPreview(q) {
    current = q;
    $('#previewCard').innerHTML = cardHTML(q);
    const d = $('#previewDialog');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  $('#btnClosePreview').addEventListener('click', () => $('#previewDialog').close());
  $('#previewDialog').addEventListener('click', (e) => { if (e.target.id === 'previewDialog') e.target.close(); });

  // ---------- 견적 카드 (이미지) ----------
  async function drawCard(q) {
    const F = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
    try { await Promise.all([document.fonts.load(`800 40px ${F}`), document.fonts.load(`500 28px ${F}`)]); } catch (e) { /* 시스템 폰트 사용 */ }
    const W = 1080, P = 64;
    const c = document.createElement('canvas'); const x = c.getContext('2d');
    const wrapText = (text, maxW, font) => {
      x.font = font; const out = [];
      String(text).split('\n').forEach((para) => {
        let line = '';
        for (const ch of para) { if (x.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
        out.push(line);
      });
      return out;
    };
    const noteFont = `500 28px ${F}`;
    const notes = [q.memo ? `📝 ${q.memo}` : null, q.note || null].filter(Boolean);
    const noteLines = notes.map((n) => wrapText(n, W - P * 2 - 40, noteFont));
    const noteH = noteLines.reduce((s, l) => s + l.length * 42 + 44 + 16, 0);
    const footLines = [q.shop.phone && `☎ ${q.shop.phone}`, q.shop.address && `📍 ${q.shop.address}`].filter(Boolean);
    const H = 260 + 84 + 24 + q.items.length * 124 + 150 + 56 + noteH + (footLines.length ? 40 + footLines.length * 48 : 0) + 80;
    c.width = W; c.height = H;
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    // 헤더
    x.fillStyle = '#14213d'; x.fillRect(0, 0, W, 260);
    x.fillStyle = '#ffffff'; x.font = `800 60px ${F}`; x.textBaseline = 'alphabetic';
    x.fillText(q.shop.name, P, 110, W - P * 2);
    x.fillStyle = '#ffd95a'; x.font = `700 36px ${F}`;
    x.fillText(`금 매입 견적서${q.customer ? ` · ${q.customer}` : ''}`, P, 166, W - P * 2);
    x.fillStyle = '#c9d0e0'; x.font = `500 28px ${F}`;
    x.fillText(`No. ${q.id}`, P, 222);
    x.textAlign = 'right'; x.fillText(`발행 ${fmtDT(q.t)}`, W - P, 222); x.textAlign = 'left';
    // 유효시간
    x.fillStyle = '#fff8e1'; x.fillRect(0, 260, W, 84);
    x.fillStyle = '#7a5b00'; x.font = `700 32px ${F}`;
    x.fillText(`⏰ ${fmtDT(q.u)}까지 이 단가로 매입`, P, 314);
    let y = 260 + 84 + 24;
    // 품목
    q.items.forEach((it) => {
      x.fillStyle = '#1d1d1f'; x.font = `700 36px ${F}`;
      x.fillText(`${it.name} · ${it.purity}`, P, y + 50, W - P * 2 - 300);
      x.fillStyle = '#6b6b72'; x.font = `500 26px ${F}`;
      x.fillText(`${it.ded ? `${fmtG(it.grams)} − 공제 ${fmtG(it.ded)} = ` : ''}${fmtG(it.net)} · 1돈 ${won(it.unit)}`, P, y + 94, W - P * 2 - 300);
      x.fillStyle = '#14213d'; x.font = `800 40px ${F}`; x.textAlign = 'right';
      x.fillText(won(it.price), W - P, y + 72); x.textAlign = 'left';
      x.strokeStyle = '#e8e1d2'; x.setLineDash([8, 8]); x.lineWidth = 2;
      x.beginPath(); x.moveTo(P, y + 122); x.lineTo(W - P, y + 122); x.stroke(); x.setLineDash([]);
      y += 124;
    });
    // 합계
    x.fillStyle = '#1d1d1f'; x.font = `700 34px ${F}`; x.fillText('예상 매입 합계', P, y + 90);
    x.fillStyle = '#14213d'; x.font = `800 64px ${F}`; x.textAlign = 'right'; x.fillText(won(q.total), W - P, y + 96); x.textAlign = 'left';
    y += 150;
    x.fillStyle = '#6b6b72'; x.font = `500 26px ${F}`;
    x.fillText(`기준 시세: 순금 1돈 ${won(q.base)}${q.baseAt ? ` (${fmtDT(q.baseAt)} 기준)` : ''}`, P, y + 10);
    y += 56;
    // 안내
    noteLines.forEach((lines) => {
      const h = lines.length * 42 + 44;
      x.fillStyle = '#fbf9f4'; roundRect(x, P, y, W - P * 2, h, 18); x.fill();
      x.fillStyle = '#55555c'; x.font = noteFont;
      lines.forEach((l, i) => x.fillText(l, P + 20, y + 52 + i * 42));
      y += h + 16;
    });
    // 푸터
    if (footLines.length) {
      y += 20; x.strokeStyle = '#e8e1d2'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke();
      x.fillStyle = '#1d1d1f'; x.font = `600 30px ${F}`;
      footLines.forEach((l, i) => x.fillText(l, P, y + 54 + i * 48, W - P * 2));
    }
    x.fillStyle = '#b0aba0'; x.font = `500 22px ${F}`; x.textAlign = 'right'; x.fillText('금견적으로 발행한 견적서', W - P, H - 30); x.textAlign = 'left';
    return c;
  }
  function roundRect(x, l, t, w, h, r) { x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath(); }

  $('#btnShareImg').addEventListener('click', async () => {
    if (!current) return;
    const btn = $('#btnShareImg'); btn.disabled = true;
    try {
      const canvas = await drawCard(current);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], `금견적-${current.id}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `${current.shop.name} 매입 견적서` }); toast('공유 창을 열었어요'); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('이미지를 저장했어요. 카톡에서 사진으로 보내세요');
    } catch (e) { console.error(e); toast('이미지를 만들지 못했어요. 카톡 문구 복사를 이용해 주세요'); }
    finally { btn.disabled = false; }
  });

  function quoteText(q) {
    const lines = [`[${q.shop.name}] 금 매입 견적서 (No. ${q.id})`, `발행 ${fmtDT(q.t)} / ⏰ ${fmtDT(q.u)}까지 유효`, ''];
    q.items.forEach((x) => lines.push(`· ${x.name} ${x.purity} ${fmtG(x.net)} → ${won(x.price)}`));
    lines.push('', `예상 매입 합계: ${won(q.total)}`, `기준 시세: 순금 1돈 ${won(q.base)}`);
    if (q.memo) lines.push(`메모: ${q.memo}`);
    if (q.note) lines.push('', q.note);
    if (q.shop.phone) lines.push(`☎ ${q.shop.phone}`);
    if (q.shop.address) lines.push(`📍 ${q.shop.address}`);
    return lines.join('\n');
  }
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) { /* noop */ } ta.remove();
    }
    toast(okMsg);
  }
  $('#btnCopyText').addEventListener('click', () => current && copy(quoteText(current), '카톡 문구를 복사했어요'));
  $('#btnCopyLink').addEventListener('click', () => current && copy(quoteLink(current), '견적 링크를 복사했어요'));

  // ---------- 견적 링크 (#q=) ----------
  const b64e = (str) => { const bytes = new TextEncoder().encode(str); let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const b64d = (s) => { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
  function quoteLink(q) {
    const compact = { v: 1, i: q.id, t: q.t, u: q.u, s: [q.shop.name, q.shop.phone, q.shop.address, q.shop.kakao], b: q.base, ba: q.baseAt, c: q.customer, m: q.memo, n: q.note,
      it: q.items.map((x) => [x.name, x.purity, x.grams, x.ded, x.net, x.unit, x.price]) };
    return `${location.origin}${location.pathname}#q=${b64e(JSON.stringify(compact))}`;
  }
  function parseLink(hash) {
    const m = /^#q=([A-Za-z0-9_-]+)$/.exec(hash || '');
    if (!m) return null;
    try {
      const o = JSON.parse(b64d(m[1]));
      const items = (o.it || []).map((a) => ({ name: String(a[0]), purity: String(a[1]), grams: +a[2] || 0, ded: +a[3] || 0, net: +a[4] || 0, unit: +a[5] || 0, price: +a[6] || 0 }));
      return { id: String(o.i), t: +o.t, u: +o.u, shop: { name: String(o.s[0] || ''), phone: String(o.s[1] || ''), address: String(o.s[2] || ''), kakao: String(o.s[3] || '') },
        base: +o.b || 0, baseAt: o.ba ? +o.ba : null, customer: String(o.c || ''), memo: String(o.m || ''), note: String(o.n || ''), items, total: items.reduce((s, x) => s + x.price, 0) };
    } catch (e) { console.warn('견적 링크 해석 실패', e); return false; }
  }
  function renderShared(q) {
    document.body.classList.add('shared');
    $('#topShop').textContent = '손님용 매입 견적서';
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-shared'));
    if (!q) { $('#sharedCard').innerHTML = '<div class="card empty">견적 링크가 올바르지 않아요. 매장에 다시 요청해 주세요.</div>'; return; }
    document.title = `${q.shop.name} 금 매입 견적서`;
    const expired = Date.now() > q.u;
    $('#sharedCard').innerHTML = (expired ? '<div class="card hint" style="color:#c62828">⚠️ 유효시간이 지난 견적입니다. 방문 전 매장에 최신 단가를 확인하세요.</div>' : '') + cardHTML(q);
    const acts = [];
    if (/^[\d\-+ ()]{6,}$/.test(q.shop.phone)) acts.push(`<a class="btn gold" href="tel:${esc(q.shop.phone.replace(/[^\d+]/g, ''))}">📞 전화하기</a>`);
    if (q.shop.address) acts.push(`<a class="btn outline" target="_blank" rel="noopener" href="https://map.naver.com/p/search/${encodeURIComponent(q.shop.address)}">📍 길찾기</a>`);
    if (/^https:\/\//.test(q.shop.kakao)) acts.push(`<a class="btn outline" target="_blank" rel="noopener" href="${esc(q.shop.kakao)}">💬 카톡 문의</a>`);
    $('#sharedActions').innerHTML = acts.join('');
  }

  // ---------- 시세 ----------
  function renderPrice() {
    $('#pBase').value = state.price.base ? state.price.base.toLocaleString('ko-KR') : '';
    $('#pUpdated').textContent = state.price.updatedAt ? `마지막 저장: ${fmtDT(state.price.updatedAt)}` : '아직 입력하지 않았어요. 거래소 고시가 또는 매장 기준가를 넣으세요.';
    $('#purityRows').innerHTML = state.purities.map((p) => `<tr data-pid="${esc(p.id)}">
      <td><b>${esc(p.label)}</b><small>함량 ${p.content}%</small></td>
      <td><input class="rate" data-k="rate" inputmode="decimal" value="${p.rate}" aria-label="${esc(p.label)} 적용률(%)" /></td>
      <td><input class="ovr" data-k="override" inputmode="numeric" placeholder="자동" value="${p.override ? p.override.toLocaleString('ko-KR') : ''}" aria-label="${esc(p.label)} 단가 직접 입력" /></td>
      <td class="unit" data-role="unit">${won(unitPrice(p.id))}</td></tr>`).join('');
    $('#priceText').textContent = priceText();
  }
  function priceText() {
    if (!state.price.base) return '순금 매입가를 저장하면 손님께 보낼 단가 안내 문구가 자동으로 만들어져요.';
    const lines = [`[${state.shop.name || '매장명'}] ${fmtDT(state.price.updatedAt || Date.now())} 기준 매입 단가 (1돈=3.75g)`];
    state.purities.forEach((p) => lines.push(`· ${p.label}: ${won(unitPrice(p.id))}`));
    lines.push('※ 실물 순도·중량 확인 후 확정됩니다.', '방문 전 품목·중량을 카톡으로 주시면 확정 견적서를 보내드려요.');
    if (state.shop.phone) lines.push(`☎ ${state.shop.phone}`);
    return lines.join('\n');
  }
  $('#pBase').addEventListener('input', (e) => { const n = money(e.target.value); e.target.value = n ? n.toLocaleString('ko-KR') : ''; e.target.classList.remove('invalid'); });
  $('#btnSavePrice').addEventListener('click', () => {
    const n = money($('#pBase').value);
    if (!n || n < 10000 || n > 100000000) { $('#pBase').classList.add('invalid'); toast('순금 1돈 매입가를 원 단위로 입력하세요 (예: 690,000)'); return; }
    state.price = { base: n, updatedAt: Date.now() };
    save(); renderPrice(); renderTop(); renderItems(); toast('오늘 시세를 저장했어요');
  });
  $('#purityRows').addEventListener('input', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const p = state.purities.find((x) => x.id === tr.dataset.pid);
    if (e.target.dataset.k === 'rate') { const r = decimal(e.target.value); p.rate = Math.min(Math.max(r, 0), 120); }
    if (e.target.dataset.k === 'override') { const n = money(e.target.value); p.override = n || null; e.target.value = n ? n.toLocaleString('ko-KR') : ''; }
    $('[data-role="unit"]', tr).textContent = won(unitPrice(p.id));
    $('#priceText').textContent = priceText();
    save(); renderItems();
  });
  $('#btnCopyPriceText').addEventListener('click', () => { if (!state.price.base) { toast('먼저 시세를 저장하세요'); return; } copy(priceText(), '단가 안내 문구를 복사했어요'); });

  // ---------- 기록 ----------
  function renderHistory() {
    const h = state.history; const n = h.length;
    const visited = h.filter((q) => q.status === 'visited' || q.status === 'bought').length;
    const bought = h.filter((q) => q.status === 'bought');
    $('#sCount').textContent = String(n);
    $('#sVisit').textContent = n ? `${Math.round((visited / n) * 100)}%` : '-';
    $('#sBought').textContent = n ? `${Math.round((bought.length / n) * 100)}%` : '-';
    const amt = bought.reduce((s, q) => s + q.total, 0);
    $('#sAmount').textContent = amt >= 10000 ? `${Math.round(amt / 10000).toLocaleString('ko-KR')}만원` : won(amt);
    if (!n) { $('#historyList').innerHTML = '<div class="card empty">아직 발행한 견적이 없어요.<br />견적 탭에서 첫 견적 카드를 만들어 보세요.</div>'; return; }
    $('#historyList').innerHTML = h.map((q) => `<div class="card h-item" data-qid="${esc(q.id)}">
      <div class="h-top"><div><b>${esc(q.customer || '손님')} · ${esc(q.items.map((i) => i.name).join(', '))}</b><div class="h-meta">${esc(q.id)} · ${fmtDT(q.t)}</div></div><span class="h-amt">${won(q.total)}</span></div>
      <div class="status-row">${STATUS.map((s) => `<button type="button" class="chip ${s.id}${q.status === s.id ? ' on' : ''}" data-status="${s.id}" aria-pressed="${q.status === s.id}">${s.label}</button>`).join('')}</div>
      <div class="row gap"><button type="button" class="btn small outline" data-act="view">카드 보기</button><button type="button" class="btn small ghost" data-act="remove">삭제</button></div>
    </div>`).join('');
  }
  $('#historyList').addEventListener('click', (e) => {
    const card = e.target.closest('[data-qid]'); if (!card) return;
    const q = state.history.find((x) => x.id === card.dataset.qid); if (!q) return;
    const sb = e.target.closest('[data-status]');
    if (sb) { q.status = sb.dataset.status; save(); renderHistory(); return; }
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'view') openPreview(q);
    if (act && act.dataset.act === 'remove' && confirm('이 견적 기록을 삭제할까요?')) { state.history = state.history.filter((x) => x !== q); save(); renderHistory(); }
  });

  // ---------- 설정 ----------
  function renderSettings() {
    const s = state.shop;
    $('#sName').value = s.name; $('#sPhone').value = s.phone; $('#sAddr').value = s.address; $('#sKakao').value = s.kakao;
    $('#sNote').value = s.note; $('#sRound').value = String(s.rounding); $('#sValid').value = String(s.valid); $('#sClose').value = s.close || '20:00';
  }
  $('#btnSaveShop').addEventListener('click', () => {
    const name = $('#sName').value.trim();
    if (!name) { $('#sName').classList.add('invalid'); $('#sName').focus(); toast('매장명은 꼭 입력해 주세요'); return; }
    const kakao = $('#sKakao').value.trim();
    if (kakao && !/^https:\/\//.test(kakao)) { $('#sKakao').classList.add('invalid'); toast('카톡 링크는 https:// 로 시작해야 해요'); return; }
    $('#sName').classList.remove('invalid'); $('#sKakao').classList.remove('invalid');
    state.shop = { ...state.shop, name, phone: $('#sPhone').value.trim(), address: $('#sAddr').value.trim(), kakao, note: $('#sNote').value.trim(),
      rounding: Number($('#sRound').value), valid: $('#sValid').value, close: $('#sClose').value || '20:00' };
    save(); renderTop(); renderItems(); syncDraftFields(); toast('설정을 저장했어요');
  });
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `금견적-백업-${partsOf(Date.now()).year}${partsOf(Date.now()).month}${partsOf(Date.now()).day}.json`;
    document.body.appendChild(a); a.click(); a.remove(); toast('백업 파일을 저장했어요');
  });
  $('#fileImport').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const s = JSON.parse(await f.text()); if (!s.shop || !s.purities) throw new Error('형식 오류'); localStorage.setItem(KEY, JSON.stringify(s)); state = load(); boot(); toast('백업을 불러왔어요'); }
    catch (err) { toast('금견적 백업 파일이 아니에요'); }
    e.target.value = '';
  });
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('매장 설정·시세·견적 기록을 모두 지울까요? 되돌릴 수 없습니다.')) return;
    localStorage.removeItem(KEY); state = fresh(); boot(); goto('quote'); toast('초기화했어요');
  });
  $('#btnDemo').addEventListener('click', () => {
    state.shop = { ...state.shop, name: '행복금은방(예시)', phone: '02-000-0000', address: '서울 종로구 종로 (예시 주소)' };
    state.price = { base: 690000, updatedAt: Date.now() };
    state.draft = { customer: '김OO 님', memo: '', valid: null, items: [
      newItem({ name: '반지', purity: '18K', weight: '3.5' }),
      newItem({ name: '목걸이', purity: '14K', weight: '7.2', deduct: '0.3' }),
      newItem({ name: '돌반지', purity: '24K', weight: '1', unit: '돈' })] };
    save(); boot(); toast('예시 데이터를 채웠어요. 값은 가상입니다');
  });

  // ---------- 신청 폼 (Netlify Forms) ----------
  // 유입 채널 추적: ?ref=insta 처럼 들어오면 기억해 두었다가 신청서에 함께 보냄 (테스트베드 채널별 성과 측정용)
  try {
    const r = new URLSearchParams(location.search).get('ref');
    if (r && /^[\w-]{1,30}$/.test(r)) localStorage.setItem('geumgyeonjeok.ref', r);
    $('#leadRef').value = localStorage.getItem('geumgyeonjeok.ref') || 'direct';
  } catch (e) { /* noop */ }
  $('#leadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target; const msg = $('#leadMsg');
    const data = new URLSearchParams(new FormData(form));
    if (data.get('bot-field')) return;
    msg.textContent = '보내는 중…';
    try {
      const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data.toString() });
      if (!res.ok) throw new Error(String(res.status));
      form.reset(); msg.textContent = '✅ 신청이 접수되었어요. 확인 후 연락드릴게요.';
    } catch (err) { msg.textContent = '전송에 실패했어요. 잠시 후 다시 시도해 주세요.'; }
  });

  // ---------- 공통 ----------
  let toastTimer;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }
  function syncDraftFields() {
    $('#qCustomer').value = state.draft.customer || ''; $('#qMemo').value = state.draft.memo || '';
    $('#qValid').value = String(state.draft.valid || state.shop.valid || '120');
  }
  function boot() { renderTop(); syncDraftFields(); renderItems(); renderPrice(); renderSettings(); renderHistory(); }

  // 테스트/디버깅용 노출 (읽기 전용)
  window.__geum = { calcItem: (it) => calcItem(it), unitPrice: (p) => unitPrice(p), get state() { return JSON.parse(JSON.stringify(state)); } };

  const shared = parseLink(location.hash);
  if (shared !== null) renderShared(shared); else boot();
  window.addEventListener('hashchange', () => { const s = parseLink(location.hash); if (s !== null) renderShared(s); else location.reload(); });
})();
