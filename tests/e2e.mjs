// 금견적 E2E 기능·사용성 테스트 (Playwright, 데스크톱 1280 + 모바일 390)
// 사용법: BASE_URL=http://localhost:8080/ node tests/e2e.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const OUT = process.env.OUT_DIR || 'docs/screenshots';
const TAG = process.env.TAG || 'local';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const expectUnit18 = Math.floor(690000 * 0.75 * 0.95);           // 491,625
const expectUnit14 = Math.floor(690000 * 0.585 * 0.95);          // 383,467
const fl = (n) => Math.floor(n / 100) * 100;
const expectTotal = fl((3.5 / 3.75) * expectUnit18) + fl((6.9 / 3.75) * expectUnit14) + 690000; // 1,854,300
const w = (n) => `${n.toLocaleString('ko-KR')}원`;

async function run(vpName, ctxOpts) {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ ...ctxOpts, locale: 'ko-KR', timezoneId: 'Asia/Seoul', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${vpName}-${n}.png`), fullPage: false });
  const T = async (id, name, fn) => {
    const t0 = Date.now();
    try { const note = await fn(); results.push({ vp: vpName, id, name, ok: true, ms: Date.now() - t0, note: note || '' }); }
    catch (e) { results.push({ vp: vpName, id, name, ok: false, ms: Date.now() - t0, note: String(e.message || e).slice(0, 300) }); }
  };
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const clip = () => page.evaluate(() => navigator.clipboard.readText());
  const tab = (t) => page.click(`.tabbar [data-tab="${t}"]`);
  const noHScroll = async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

  await T('T01', '초기 로딩·온보딩 표시', async () => {
    const res = await page.goto(BASE + '?ref=e2e-test', { waitUntil: 'networkidle' });
    assert(res.status() === 200, `HTTP ${res.status()}`);
    assert(await page.isVisible('#onboarding'), '온보딩 카드 미표시');
    assert((await page.textContent('#topPrice')).includes('시세 미입력'), '상단 시세칩 초기값 오류');
    await shot('01-onboarding');
    return `HTTP 200, title="${await page.title()}"`;
  });

  await T('T02', '매장명 없이 카드 만들기 → 설정으로 안내', async () => {
    await page.click('#btnMakeCard');
    assert(await page.isVisible('#view-settings'), '설정 화면으로 이동하지 않음');
    assert((await page.textContent('#toast')).includes('매장명'), '토스트 안내 없음');
  });

  await T('T03', '매장 설정 필수값 검증 및 저장', async () => {
    await tab('settings');
    await page.fill('#sName', '');
    await page.click('#btnSaveShop');
    assert(await page.$eval('#sName', (e) => e.classList.contains('invalid')), '빈 매장명 검증 실패');
    await page.fill('#sKakao', 'pf.kakao.com/abc');
    await page.fill('#sName', '행복금은방');
    await page.click('#btnSaveShop');
    assert(await page.$eval('#sKakao', (e) => e.classList.contains('invalid')), '잘못된 카톡 링크 검증 실패');
    await page.fill('#sKakao', 'https://pf.kakao.com/_example');
    await page.fill('#sPhone', '02-123-4567');
    await page.fill('#sAddr', '서울 종로구 종로 123 1층');
    await page.click('#btnSaveShop');
    assert((await page.textContent('#topShop')) === '행복금은방', '상단바에 매장명 미반영');
    await shot('02-settings');
  });

  await T('T04', '시세 입력 검증·저장·순도별 단가 계산', async () => {
    await tab('price');
    await page.fill('#pBase', '12');
    await page.click('#btnSavePrice');
    assert(await page.$eval('#pBase', (e) => e.classList.contains('invalid')), '비정상 시세 검증 실패');
    await page.fill('#pBase', '690000');
    assert((await page.inputValue('#pBase')) === '690,000', '천 단위 콤마 자동 포맷 실패');
    await page.click('#btnSavePrice');
    const u18 = await page.textContent('tr[data-pid="18K"] [data-role="unit"]');
    const u14 = await page.textContent('tr[data-pid="14K"] [data-role="unit"]');
    assert(u18 === w(expectUnit18), `18K 단가 ${u18} ≠ ${w(expectUnit18)}`);
    assert(u14 === w(expectUnit14), `14K 단가 ${u14} ≠ ${w(expectUnit14)}`);
    assert((await page.textContent('#topPrice')).includes('690,000'), '상단 시세칩 미반영');
    await shot('03-price');
    return `18K ${u18}, 14K ${u14}`;
  });

  await T('T05', '적용률 변경·단가 직접 입력 반영', async () => {
    await page.fill('tr[data-pid="22K"] [data-k="rate"]', '90');
    const u22 = await page.textContent('tr[data-pid="22K"] [data-role="unit"]');
    assert(u22 === w(Math.floor(690000 * 0.917 * 0.9)), `22K 단가 ${u22}`);
    await page.fill('tr[data-pid="22K"] [data-k="override"]', '600000');
    assert((await page.textContent('tr[data-pid="22K"] [data-role="unit"]')) === '600,000원', '직접 입력 미반영');
    await page.fill('tr[data-pid="22K"] [data-k="override"]', '');
    await page.fill('tr[data-pid="22K"] [data-k="rate"]', '95');
    return `22K 90% → ${u22}, 직접입력 600,000원 확인 후 원복`;
  });

  await T('T06', '"오늘 얼마예요?" 단가 안내 문구 복사', async () => {
    await page.click('#btnCopyPriceText');
    const t = await clip();
    assert(t.includes('[행복금은방]') && t.includes(`18K: ${w(expectUnit18)}`), `클립보드 내용 불일치: ${t.slice(0, 80)}`);
    return t.split('\n')[0];
  });

  await T('T07', '견적 작성: 필수값 검증 + 3개 품목 합계', async () => {
    await tab('quote');
    await page.click('#btnMakeCard');
    assert(await page.$eval('.item [data-k="weight"]', (e) => e.classList.contains('invalid')), '중량 누락 검증 실패');
    assert(!(await page.isVisible('#previewDialog')), '검증 실패인데 미리보기가 열림');
    await page.fill('#qCustomer', '김OO 님');
    const it = (i) => `.item:nth-of-type(${i})`;
    await page.fill(`${it(1)} [data-k="name"]`, '반지');
    await page.selectOption(`${it(1)} [data-k="purity"]`, '18K');
    await page.fill(`${it(1)} [data-k="weight"]`, '3.5');
    await page.click('#btnAddItem');
    await page.fill(`${it(2)} [data-k="name"]`, '목걸이');
    await page.selectOption(`${it(2)} [data-k="purity"]`, '14K');
    await page.fill(`${it(2)} [data-k="weight"]`, '7.2');
    await page.fill(`${it(2)} [data-k="deduct"]`, '0.3');
    await page.click('#btnAddItem');
    await page.fill(`${it(3)} [data-k="name"]`, '돌반지');
    await page.selectOption(`${it(3)} [data-k="purity"]`, '24K');
    await page.click(`${it(3)} [data-unit="돈"]`);
    await page.fill(`${it(3)} [data-k="weight"]`, '1');
    const total = await page.textContent('#qTotal');
    assert(total === w(expectTotal), `합계 ${total} ≠ ${w(expectTotal)}`);
    await page.fill('#qMemo', '큐빅 제거 후 실중량 기준');
    await shot('04-quote');
    return `합계 ${total}`;
  });

  await T('T08', '공제 중량 > 총중량 오류 표시·삭제 버튼', async () => {
    await page.click('#btnAddItem');
    const it4 = '.item:nth-of-type(4)';
    await page.fill(`${it4} [data-k="weight"]`, '1');
    await page.fill(`${it4} [data-k="deduct"]`, '2');
    const err = await page.textContent(`${it4} [data-role="err"]`);
    assert(err.includes('공제'), '공제 오류 미표시');
    await page.click(`${it4} [data-act="del"]`);
    assert((await page.$$('.item')).length === 3, '품목 삭제 실패');
    assert((await page.textContent('#qTotal')) === w(expectTotal), '삭제 후 합계 변동');
  });

  let quoteId = '';
  await T('T09', '견적 카드 만들기 → 미리보기', async () => {
    await page.click('#btnMakeCard');
    await page.waitForSelector('#previewDialog[open] .qcard');
    quoteId = await page.getAttribute('#previewCard .qcard', 'data-quote');
    assert(/^Q\d{6}-\d{3}$/.test(quoteId), `견적번호 형식 오류 ${quoteId}`);
    assert((await page.textContent('#previewCard [data-role="total"]')) === w(expectTotal), '카드 합계 불일치');
    assert((await page.textContent('#previewCard')).includes('까지 이 단가로 매입'), '유효시간 미표시');
    await shot('05-preview');
    return quoteId;
  });

  await T('T10', '이미지 공유/저장 → PNG 생성', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnShareImg')]);
    const p = path.join(OUT, `${vpName}-quote-card-output.png`);
    await dl.saveAs(p);
    const buf = fs.readFileSync(p);
    assert(buf.slice(1, 4).toString() === 'PNG', 'PNG 시그니처 아님');
    const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
    assert(width === 1080 && height > 900, `해상도 이상 ${width}x${height}`);
    return `${dl.suggestedFilename()} ${width}x${height}, ${(buf.length / 1024).toFixed(0)}KB`;
  });

  await T('T11', '카톡 문구 복사', async () => {
    await page.click('#btnCopyText');
    const t = await clip();
    assert(t.includes(quoteId) && t.includes(`예상 매입 합계: ${w(expectTotal)}`), '문구 내용 불일치');
    return `${t.split('\n').length}줄`;
  });

  let link = '';
  await T('T12', '견적 링크 → 손님용 화면 (새 브라우저, 저장 데이터 없음)', async () => {
    await page.click('#btnCopyLink');
    link = await clip();
    assert(link.includes('#q='), '링크 형식 오류');
    const ctx2 = await browser.newContext({ ...ctxOpts, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const p2 = await ctx2.newPage();
    const errs2 = [];
    p2.on('pageerror', (e) => errs2.push(String(e)));
    p2.on('console', (m) => { if (m.type() === 'error') errs2.push(m.text()); });
    await p2.goto(link, { waitUntil: 'networkidle' });
    assert(await p2.isVisible('#view-shared .qcard'), '손님용 견적서 미표시');
    assert((await p2.textContent('#view-shared [data-role="total"]')) === w(expectTotal), '손님용 합계 불일치');
    assert((await p2.textContent('#view-shared .qc-shop')) === '행복금은방', '매장명 불일치');
    assert(!(await p2.isVisible('.tabbar')), '손님 화면에 사장님 메뉴 노출');
    assert(await p2.isVisible('#sharedActions a[href^="tel:"]'), '전화 버튼 없음');
    await p2.screenshot({ path: path.join(OUT, `${vpName}-06-shared.png`), fullPage: true });
    await p2.goto(BASE + '#q=broken!!', { waitUntil: 'networkidle' });
    await p2.goto(BASE + '#q=bm90LWpzb24', { waitUntil: 'networkidle' });
    await p2.reload({ waitUntil: 'networkidle' });
    assert((await p2.textContent('#sharedCard')).includes('올바르지 않아요'), '깨진 링크 안내 없음');
    const realErrs = errs2.filter((e) => !e.includes('견적 링크 해석 실패'));
    assert(realErrs.length === 0, `손님 화면 콘솔 에러: ${realErrs.join(' | ')}`);
    await ctx2.close();
    return `링크 길이 ${link.length}자`;
  });

  await T('T13', '기록: 상태 변경·통계·새로고침 유지', async () => {
    await page.click('#btnClosePreview');
    await tab('history');
    assert((await page.textContent('#sCount')) === '1', '발행 건수 오류');
    await page.click(`[data-qid="${quoteId}"] [data-status="bought"]`);
    assert((await page.textContent('#sBought')) === '100%', '성사율 미갱신');
    assert((await page.textContent('#sAmount')) === `${Math.round(expectTotal / 10000)}만원`, '성사 금액 오류');
    await shot('07-history');
    await page.reload({ waitUntil: 'networkidle' });
    await tab('history');
    assert(await page.$eval(`[data-qid="${quoteId}"] [data-status="bought"]`, (e) => e.classList.contains('on')), '새로고침 후 상태 유실');
    await page.click(`[data-qid="${quoteId}"] [data-act="view"]`);
    await page.waitForSelector('#previewDialog[open]');
    await page.click('#btnClosePreview');
  });

  await T('T14', '전용 버전 신청 폼 (전송은 모의 응답)', async () => {
    await page.route('**/*', (route) => {
      const r = route.request();
      if (r.method() === 'POST') return route.fulfill({ status: 200, body: 'ok' });
      return route.continue();
    });
    let posted = '';
    page.on('request', (r) => { if (r.method() === 'POST') posted = r.postData() || ''; });
    await tab('settings');
    await page.click('#leadForm button[type="submit"]');
    assert(!(await page.textContent('#leadMsg')).includes('접수'), '필수값 없이 제출됨');
    await page.fill('#leadForm [name="shop"]', '[테스트] 행복금은방');
    await page.fill('#leadForm [name="contact"]', 'test');
    await page.click('#leadForm button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#leadMsg').textContent.includes('접수'));
    assert(posted.includes('form-name=custom-request'), `폼 이름 누락: ${posted}`);
    assert(posted.includes('ref=e2e-test'), `유입 채널(ref) 누락: ${posted}`);
    await page.unroute('**/*');
    return 'POST 본문에 form-name=custom-request, ref=e2e-test(유입 채널) 포함 확인';
  });

  await T('T15', '백업 내보내기(JSON)', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExport')]);
    const p = await dl.path();
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert(j.shop.name === '행복금은방' && j.history.length === 1, '백업 내용 불일치');
    return dl.suggestedFilename();
  });

  await T('T16', '레이아웃: 모든 탭 가로 스크롤 없음', async () => {
    for (const t of ['quote', 'price', 'history', 'settings']) { await tab(t); assert(await noHScroll(), `${t} 탭 가로 넘침`); }
    await tab('price');
    const tbl = await page.$eval('.table-card', (e) => [e.scrollWidth, e.clientWidth]);
    assert(tbl[0] <= tbl[1] + 1, `시세표 내부 가로 넘침 ${tbl[0]}>${tbl[1]}`);
    return `시세표 폭 ${tbl[0]}/${tbl[1]}px`;
  });

  await T('T17', '전체 초기화 → 예시 데이터 체험 흐름', async () => {
    await tab('settings');
    await page.click('#btnReset');
    assert(await page.isVisible('#onboarding'), '초기화 후 온보딩 미표시');
    await page.click('#btnDemo');
    assert((await page.textContent('#qTotal')) === w(expectTotal), '예시 데이터 합계 불일치');
    await page.click('#btnMakeCard');
    await page.waitForSelector('#previewDialog[open] .qcard');
    await page.click('#btnClosePreview');
    return `예시 합계 ${w(expectTotal)}`;
  });

  await T('T18b', '조작 요소가 다른 레이어(호스팅 배지 등)에 가려지지 않음', async () => {
    const hits = async (sel) => page.$eval(sel, (el) => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const pts = [[r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4], [r.left + r.width / 2, r.top + r.height / 2]]; return pts.every(([x, y]) => { const h = document.elementFromPoint(x, y); return h && (h === el || el.contains(h)); }); });
    await tab('quote');
    const checks = ['.tabbar [data-tab="quote"]', '.tabbar [data-tab="price"]', '.tabbar [data-tab="history"]', '.tabbar [data-tab="settings"]', '#btnMakeCard', '#btnAddItem'];
    for (const sel of checks) assert(await hits(sel), `${sel} 가려짐`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    assert(await page.evaluate(() => { const el = document.querySelector('#btnMakeCard'); const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.right - 6, r.bottom - 6); return h === el || el.contains(h); }), '맨 아래 스크롤 시 카드 만들기 버튼 가려짐');
    await tab('settings');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    assert(await hits('#leadForm button[type="submit"]'), '신청 버튼 가려짐');
    return `${checks.length + 2}개 요소 elementFromPoint 확인`;
  });

  await T('T18', '콘솔 에러 0건', async () => {
    assert(consoleErrors.length === 0, consoleErrors.join(' | '));
  });

  await browser.close();
}

await run('desktop', { viewport: { width: 1280, height: 860 } });
await run('mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });

const pass = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, `../test-results-${TAG}.json`), JSON.stringify({ base: BASE, at: new Date().toISOString(), pass, total: results.length, results }, null, 2));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.vp}] ${r.id} ${r.name} (${r.ms}ms) ${r.note}`);
console.log(`\n${pass}/${results.length} passed @ ${BASE}`);
process.exit(pass === results.length ? 0 : 1);
