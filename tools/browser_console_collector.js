// ============================================================
//  브라우저 콘솔 수집기
//  TikTok Creative Center / vidIQ / Google Trends처럼
//  브라우저 렌더링만 되는 데이터는 스크립트가 못 긁는다.
//  → 해당 페이지에서 F12 → Console → 이 코드 붙여넣기 → Enter
//  → JSON이 클립보드에 복사됨
//  → data/manual_<SITE>.json 으로 저장하면 리포트에 자동 합쳐짐
// ============================================================
(function () {
  const site =
    location.hostname.includes('tiktok') ? 'TIKTOK' :
    location.hostname.includes('vidiq') ? 'VIDIQ' :
    location.hostname.includes('google') ? 'GTRENDS' :
    location.hostname.toUpperCase();

  const data = { site, url: location.href, collectedAt: new Date().toISOString(), items: [] };

  // 1) 표 형태 (vidIQ trending keywords)
  const rows = [...document.querySelectorAll('table tr')].slice(1);
  for (const tr of rows) {
    const cells = [...tr.querySelectorAll('th,td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim());
    if (!cells.length) continue;
    const keyword = cells.find((c) => c && /[a-z가-힣]{3,}/i.test(c) && !/^\d/.test(c));
    if (keyword) data.items.push({ keyword, row: cells.join(' | ') });
  }

  // 2) 카드/리스트 형태 (TikTok 해시태그 등)
  if (!data.items.length) {
    const cards = [...document.querySelectorAll('[class*="card"], [class*="row"], li')].slice(0, 80);
    for (const el of cards) {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const hash = t.match(/#[^\s#]{2,40}/);
      const views = t.match(/([\d.]+[KM]?)\s*Views/i);
      if (hash) data.items.push({ keyword: hash[0], views: views ? views[1] : '', raw: t.slice(0, 200) });
    }
  }

  // 3) 본문 텍스트 폴백
  if (!data.items.length) {
    data.rawText = document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 8000);
  }

  const json = JSON.stringify(data, null, 2);
  console.log(json);
  try {
    navigator.clipboard.writeText(json);
    console.log('\n[OK] 클립보드에 복사됨 → data/manual_' + site + '.json 으로 저장하세요.');
  } catch (e) {
    console.log('\n[주의] 클립보드 복사 실패. 위 JSON을 직접 복사하세요.');
  }
})();
