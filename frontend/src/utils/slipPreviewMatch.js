function amtNorm(v) {
  return parseFloat((v || '').toString().replace(/,/g, '')).toFixed(2);
}

function extractMerchantKeywords(merchant = '') {
  const stop = new Set(['TRACE', 'APPR', 'TID', 'DATE', 'TIME', 'RRN', 'REF', 'STAN', 'NAKORNRATSIMA', 'MAKORNRATSIMA']);
  return merchant
    .replace(/^PTTST\.D_|^PTTRM_/, '')
    .split(/[\s_]+/)
    .map((k) => (k || '').replace(/[^A-Za-z]/g, '').toUpperCase())
    .filter((k) => k.length >= 3 && !stop.has(k));
}

/**
 * Match 1 สลิปหน้า -> statement transaction (ใช้เหมือน logic ใน SlipPreview เดิม)
 * คืนค่า match flags เพื่อเอาไปทำ UI ตรวจจับความผิดปกติ
 */
export function matchSlipToStatement(currentPage, result) {
  const pv = currentPage?.manualValues || currentPage?.correctedValues || currentPage?.values || {};
  const slipDate = pv.date;
  const slipAmount = pv.amount;
  const slipMerchant = pv.merchant || '';
  /** เลข 4 ตัวจากสลิปเท่านั้น — ไม่เติมจากเลขบัตรในรายการ (กันสับสนกับ OCR) */
  const slipLast4FromSlip = pv.last4 ? String(pv.last4).trim() : '';
  let inferredLast4FromCard = null;
  let last4ForMatch = slipLast4FromSlip;

  const merchantKeywords = extractMerchantKeywords(slipMerchant);

  let matchedCard = null;
  let matchedTxn = null;
  let matchedTxnIndex = null;

  if (result?.data && slipDate && slipAmount) {
    const slipAmt = amtNorm(slipAmount);

    const hasMerchantKeywords = merchantKeywords.length > 0;
    const matchPasses = [
      // strict: เลขบัตร + ร้าน/สาขา ต้องตรง
      (isL4Match, isMerchMatch) => isL4Match && isMerchMatch,
      // ไม่มีเลขบัตรจากสลิป แต่มีร้านชัดเจน
      (isL4Match, isMerchMatch) => !last4ForMatch && isMerchMatch,
      // ยอม match ด้วย last4 อย่างเดียวได้ ก็ต่อเมื่อ "ไม่มี keyword ร้าน"
      (isL4Match) => isL4Match && !hasMerchantKeywords,
      // เคสอ่อนสุด (ไม่มี last4 และไม่มี keyword ร้าน)
      () => !last4ForMatch && !hasMerchantKeywords,
    ];

    for (const passFn of matchPasses) {
      for (const card of result.data) {
        const isLast4Match = last4ForMatch
          ? (card.card_no || '').replace(/\D/g, '').slice(-4) === last4ForMatch
          : false;

        for (let tIdx = 0; tIdx < (card.transactions || []).length; tIdx++) {
          const txn = card.transactions[tIdx];
          if (txn.type === 'ชำระเงิน') continue;

          const dateOk = txn.date === slipDate;
          const amtOk = amtNorm(txn.amount) === slipAmt && !isNaN(parseFloat(slipAmt));
          const descUpper = (txn.desc || '').toUpperCase();

          // ถ้า keyword ว่าง แปลว่า "ไม่สามารถตรวจร้าน/สาขาได้" ให้ถือว่า match ได้
          const merchantOk =
            merchantKeywords.length === 0 ||
            merchantKeywords.some((kw) => descUpper.includes(kw.toUpperCase()));

          if (dateOk && amtOk && passFn(isLast4Match, merchantOk)) {
            matchedCard = card;
            matchedTxn = txn;
            matchedTxnIndex = tIdx;

            if (!last4ForMatch) {
              inferredLast4FromCard = (card.card_no || '').replace(/\D/g, '').slice(-4) || null;
            }
            break;
          }
        }
        if (matchedTxn) break;
      }
      if (matchedTxn) break;
    }
  }

  // Fallback: ถ้าจับคู่แบบ strict ไม่เจอ แต่ "คำร้าน/สาขา + วันที่ + ยอด" ตรงกัน
  // ให้ลองแม้ last4 ไม่ตรง (ช่วยกรณี OCR last4 เพี้ยนจากรูปเอียง)
  if (!matchedTxn && merchantKeywords.length > 0 && slipDate && slipAmount) {
    for (const card of result.data || []) {
      for (let tIdx = 0; tIdx < (card.transactions || []).length; tIdx++) {
        const txn = card.transactions[tIdx];
        if (txn.type === 'ชำระเงิน') continue;

        const dateOk = txn.date === slipDate;
        const amtOk = amtNorm(txn.amount) === amtNorm(slipAmount) && !isNaN(parseFloat(slipAmount));
        const descUpper = (txn.desc || '').toUpperCase();
        const merchantOk = merchantKeywords.some((kw) =>
          descUpper.includes(kw.toUpperCase()),
        );

        if (dateOk && amtOk && merchantOk) {
          matchedCard = card;
          matchedTxn = txn;
          matchedTxnIndex = tIdx;
          break;
        }
      }
      if (matchedTxn) break;
    }
  }

  // Fallback เมื่ออ่าน amount ไม่ได้:
  // จับคู่ด้วย date + merchant (+last4 ถ้ามี) เฉพาะกรณีที่เจอ candidate เดียวเท่านั้น
  if (!matchedTxn && merchantKeywords.length > 0 && slipDate && !slipAmount) {
    const candidates = [];
    for (const card of result.data || []) {
      const cardLast4 = (card.card_no || '').replace(/\D/g, '').slice(-4);
      const isLast4Match = last4ForMatch ? cardLast4 === last4ForMatch : true;
      if (!isLast4Match) continue;
      for (let tIdx = 0; tIdx < (card.transactions || []).length; tIdx++) {
        const txn = card.transactions[tIdx];
        if (txn.type === 'ชำระเงิน') continue;
        if (txn.date !== slipDate) continue;
        const descUpper = (txn.desc || '').toUpperCase();
        const merchantOk = merchantKeywords.some((kw) => descUpper.includes(kw.toUpperCase()));
        if (!merchantOk) continue;
        candidates.push({ card, txn, tIdx });
      }
    }
    if (candidates.length === 1) {
      matchedCard = candidates[0].card;
      matchedTxn = candidates[0].txn;
      matchedTxnIndex = candidates[0].tIdx;
      if (!last4ForMatch) {
        inferredLast4FromCard = (matchedCard.card_no || '').replace(/\D/g, '').slice(-4) || null;
      }
    }
  }

  const hasCard = !!matchedCard;
  const hasTxn = !!matchedTxn;

  const dateMatch = hasTxn ? matchedTxn.date === slipDate : null;
  const amtMatch = hasTxn ? amtNorm(matchedTxn.amount) === amtNorm(slipAmount) : null;
  const merchantMatch =
    hasTxn &&
    (merchantKeywords.length === 0 ||
      merchantKeywords.some((kw) =>
        (matchedTxn.desc || '').toUpperCase().includes(kw.toUpperCase()),
      ));

  const cardLast4 = matchedCard ? (matchedCard.card_no || '').replace(/\D/g, '').slice(-4) : null;
  let last4Match = null;
  if (hasTxn && slipLast4FromSlip && cardLast4) {
    last4Match = slipLast4FromSlip === cardLast4;
  }

  return {
    slipDate,
    slipAmount,
    slipMerchant,
    slipLast4: slipLast4FromSlip || null,
    inferredLast4FromCard,
    matchedCard,
    matchedTxn,
    matchedTxnIndex,
    hasCard,
    hasTxn,
    dateMatch,
    amtMatch,
    merchantMatch,
    last4Match,
  };
}

