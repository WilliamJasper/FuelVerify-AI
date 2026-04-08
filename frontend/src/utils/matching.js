// Utilities to match slip pages to statement transactions

function normalizeAmount(value) {
  const s = (value ?? '').toString().replace(/,/g, '').trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n.toFixed(2);
}

function normalizeDate(value) {
  const s = (value ?? '').toString().trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const yy = y.length === 4 ? y.slice(-2) : y;
  return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${yy}`;
}

function extractMerchantKeywords(merchant = '') {
  const cleaned = merchant.replace(/^PTTST\.?D_|^PTTRM_/, '').toUpperCase();
  const stop = new Set(['TRACE', 'APPR', 'TID', 'DATE', 'TIME', 'RRN', 'REF', 'STAN', 'NAKORNRATSIMA', 'MAKORNRATSIMA']);
  return cleaned
    .split(/[\s_]+/)
    .map((k) => (k || '').replace(/[^A-Z]/g, ''))
    .filter((k) => k.length >= 3 && !stop.has(k));
}

function last4FromCardNo(cardNo = '') {
  return (cardNo || '').replace(/\D/g, '').slice(-4) || null;
}

export function doesPageMatchTxn(page, card, txn) {
  if (!page || !txn) return { match: false };
  const pv = page.manualValues || page.correctedValues || page.values || {};
  const pageDate = normalizeDate(pv.date);
  const pageAmt = normalizeAmount(pv.amount);
  const pageLast4 = (pv.last4 || '').toString();
  const pageMerchKws = extractMerchantKeywords(pv.merchant || '');

  const txnDate = normalizeDate(txn.date);
  const txnAmt = normalizeAmount(txn.amount);
  const txnDesc = (txn.desc || '').toUpperCase();
  const cardL4 = last4FromCardNo(card?.card_no || '');

  const isLast4Match = pageLast4 ? cardL4 === pageLast4 : false;
  const dateOk = !!pageDate && !!txnDate && pageDate === txnDate;
  const amtOk = !!pageAmt && !!txnAmt && pageAmt === txnAmt;
  const merchOk =
    pageMerchKws.length === 0 ||
    pageMerchKws.some((kw) => txnDesc.includes(kw));

  // Multi-pass like SlipPreview
  const hasMerchantKeywords = pageMerchKws.length > 0;
  const passes = [
    isLast4Match && merchOk && dateOk && amtOk,
    !pageLast4 && merchOk && dateOk && amtOk,
    // ยอมข้าม merchant ได้เฉพาะตอนที่ OCR ไม่ได้ร้าน (keyword ว่าง)
    isLast4Match && !hasMerchantKeywords && dateOk && amtOk,
    !pageLast4 && !hasMerchantKeywords && dateOk && amtOk,
    // amount หาย: ยอมเฉพาะ date + merchant + last4
    !pageAmt && isLast4Match && merchOk && dateOk,
  ];

  const match = passes.some(Boolean);
  const missing = {
    date: !dateOk,
    amount: !amtOk,
    last4: pageLast4 ? !isLast4Match : true,
    merchant: !merchOk,
  };

  return { match, missing };
}

export function buildCoverageSummary(result, slipResult) {
  const cards = Array.isArray(result?.data) ? result.data : [];
  const pages = Array.isArray(slipResult?.pages) ? slipResult.pages : [];

  const txns = [];
  for (const card of cards) {
    for (const txn of card.transactions || []) {
      const descUpper = (txn.desc || '').toUpperCase();
      if (txn.type === 'ชำระเงิน') continue;
      if (txn.type === 'INTEREST') continue;
      if (descUpper.includes('INTEREST')) continue;
      txns.push({ card, txn });
    }
  }

  const matched = [];
  const unmatched = [];
  const usedSlipPageIndices = new Set();

  for (const { card, txn } of txns) {
    let found = null;
    let foundPageIndex = -1;
    let bestMissing = null;
    let bestMissingCount = Infinity;
    for (const p of pages) {
      const { match, missing } = doesPageMatchTxn(p, card, txn);
      const missingCount = [missing.date, missing.amount, missing.last4, missing.merchant].filter(Boolean).length;
      if (missingCount < bestMissingCount) {
        bestMissingCount = missingCount;
        bestMissing = missing;
      }
    }

    // สำคัญ: ให้ 1 หน้า สลิปถูกใช้จับคู่ได้ครั้งเดียว (global unique)
    // ไม่งั้นสลิปหน้าเดียวอาจไป match หลายรายการ ทำให้ตัวเลข "จับคู่สำเร็จ" สูงเกินจริง
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      if (usedSlipPageIndices.has(pIdx)) continue;
      const p = pages[pIdx];
      const { match } = doesPageMatchTxn(p, card, txn);
      if (match) {
        found = p;
        foundPageIndex = pIdx;
        break;
      }
    }
    if (found) {
      if (foundPageIndex >= 0) usedSlipPageIndices.add(foundPageIndex);
      matched.push({ card, txn });
    } else {
      unmatched.push({
        card,
        txn,
        missing: bestMissing || {
          date: true,
          amount: true,
          last4: true,
          merchant: true,
        },
      });
    }
  }

  return {
    totalTxns: txns.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    matched,
    unmatched,
  };
}

