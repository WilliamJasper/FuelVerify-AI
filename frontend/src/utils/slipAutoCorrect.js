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
  return merchant
    .replace(/^PTTST\.D_|^PTTRM_/, '')
    .toUpperCase()
    .split(/[\s_]+/)
    .filter((k) => k.length >= 3);
}

function last4FromCardNo(cardNo = '') {
  return (cardNo || '').replace(/\D/g, '').slice(-4) || null;
}

function statementMerchantFromTxnDesc(desc = '') {
  const s = String(desc || '').toUpperCase().trim();
  if (!s) return null;
  // Keep it readable while still useful for matching UI.
  return `STMT_${s.slice(0, 64)}`;
}

function candidateScore(pageValues, card, txn) {
  const pvDate = normalizeDate(pageValues?.date);
  const pvAmt = normalizeAmount(pageValues?.amount);
  const pvLast4 = (pageValues?.last4 || '').toString();
  const pvMerchKw = extractMerchantKeywords(pageValues?.merchant || '');

  const txnDate = normalizeDate(txn?.date);
  const txnAmt = normalizeAmount(txn?.amount);
  const txnDesc = (txn?.desc || '').toUpperCase();
  const cardLast4 = last4FromCardNo(card?.card_no || '');

  let score = 0;
  if (pvDate && txnDate && pvDate === txnDate) score += 5;
  if (pvAmt && txnAmt && pvAmt === txnAmt) score += 5;
  if (pvLast4 && cardLast4 && pvLast4 === cardLast4) score += 4;
  if (pvMerchKw.length > 0 && pvMerchKw.some((kw) => txnDesc.includes(kw))) score += 3;

  return score;
}

export function autoCorrectSlipPages(pages, result) {
  const cards = Array.isArray(result?.data) ? result.data : [];
  if (!Array.isArray(pages) || pages.length === 0 || cards.length === 0) return pages;

  return pages.map((page) => {
    const values = page?.values || {};
    const quality = page?.quality || {};
    const missing = {
      merchant: !values.merchant,
      date: !values.date,
      time: !values.time,
      last4: !(values.last4 || '').toString(),
      amount: !values.amount,
    };
    const amountConfidence = Number(quality?.field_confidence?.amount ?? 0);
    const needFix = missing.merchant || missing.last4 || missing.amount || amountConfidence < 0.75;
    if (!needFix) return page;

    const candidates = [];
    for (const card of cards) {
      for (const txn of card.transactions || []) {
        if (txn?.type === 'ชำระเงิน' || txn?.type === 'INTEREST') continue;
        const score = candidateScore(values, card, txn);
        if (score <= 0) continue;
        candidates.push({ card, txn, score });
      }
    }
    if (candidates.length === 0) return page;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates[1];
    const uniqueEnough = !second || best.score >= second.score + 3;
    if (!uniqueEnough || best.score < 8) return page;

    const correctedValues = { ...values };
    const reasons = [];
    const cardLast4 = last4FromCardNo(best.card?.card_no || '');
    const txnAmt = normalizeAmount(best.txn?.amount);
    const curAmt = normalizeAmount(correctedValues.amount);

    const pvDate = normalizeDate(values?.date);
    const pvTime = (values?.time || '').toString();
    const pvLast4 = (values?.last4 || '').toString();
    const txnDate = normalizeDate(best.txn?.date);
    const txnTime = (best.txn?.time || '').toString();
    const strongIdentityMatch =
      !!pvDate && !!txnDate && pvDate === txnDate &&
      !!pvTime && !!txnTime && pvTime === txnTime &&
      !!pvLast4 && !!cardLast4 && pvLast4 === cardLast4;

    if (!curAmt && txnAmt) {
      correctedValues.amount = txnAmt;
      reasons.push('เติมยอดเงินจาก statement');
    } else if (
      txnAmt &&
      curAmt &&
      curAmt !== txnAmt &&
      strongIdentityMatch &&
      uniqueEnough &&
      best.score >= 11
    ) {
      // กันเคส TOTAL/BALANCE สลับกัน: date+time+last4 ตรงเป๊ะ แต่ยอดสลิปผิด
      correctedValues.amount = txnAmt;
      reasons.push('แก้ยอดเงินจาก statement (TOTAL/BALANCE สลับ)');
    } else if (amountConfidence < 0.75 && txnAmt && uniqueEnough && best.score >= 10) {
      correctedValues.amount = txnAmt;
      reasons.push('แก้ยอดเงินจาก statement (confidence ต่ำ)');
    }

    if (!correctedValues.last4 && cardLast4) {
      correctedValues.last4 = cardLast4;
      reasons.push('เติมเลข 4 ตัวจาก statement');
    }
    if (!correctedValues.merchant) {
      const merch = statementMerchantFromTxnDesc(best.txn?.desc);
      if (merch) {
        correctedValues.merchant = merch;
        reasons.push('เติมร้าน/สาขาจาก statement');
      }
    }

    if (!correctedValues.amount && txnAmt && uniqueEnough && best.score >= 12 && missing.amount) {
        correctedValues.amount = txnAmt;
        reasons.push('เติมยอดเงินจาก statement');
    }

    const changed =
      correctedValues.amount !== values.amount ||
      correctedValues.last4 !== values.last4 ||
      correctedValues.merchant !== values.merchant;

    if (!changed) return page;
    return {
      ...page,
      correctedValues,
      correction: {
        applied: true,
        score: best.score,
        reasons,
      },
    };
  });
}

