import { 
  normalizeAmount, 
  normalizeDate, 
  extractMerchantKeywords, 
  last4FromCardNo 
} from './matching.js';

/**
 * Match 1 สลิปหน้า -> statement transaction
 * คืนค่า match flags เพื่อเอาไปทำ UI ตรวจจับความผิดปกติ
 */
export function matchSlipToStatement(currentPage, result) {
  const pv = currentPage?.manualValues || currentPage?.correctedValues || currentPage?.values || {};
  const slipDate = normalizeDate(pv.date);
  const slipAmount = normalizeAmount(pv.amount);
  const slipMerchant = pv.merchant || '';
  const slipLast4 = pv.last4 ? String(pv.last4).trim() : '';
  
  const merchantKeywords = extractMerchantKeywords(slipMerchant);
  const hasKeywords = merchantKeywords.length > 0;

  let matchedCard = null;
  let matchedTxn = null;
  let matchedTxnIndex = null;
  let inferredLast4FromCard = null;

  if (result?.data && slipDate) {
    // Pass 1: "Super Strict" - ร้านตรง + วันที่ตรง + ยอดตรง + เลขบัตรตรง
    // Pass 2: "Strong Match" - ร้านตรง + วันที่ตรง + ยอดตรง (เลขบัตรไม่ต้องตรง/ไม่มีก็ยอม)
    // Pass 3: "Classic" - เลขบัตรตรง + ร้านตรง + วันที่ตรง + ยอดตรง (เผื่อ pass 1 หลุด)
    // Pass 4: "Classic Soft" - ร้านตรง + วันที่ตรง + ยอดตรง (ยอมถ้าร้านตรงเป๊ะแม้ไม่มีเลขบัตร)
    
    // เราจะวนหาเพื่อหา "ผู้ชนะ" ที่ดีที่สุด
    for (const card of result.data) {
      const cardL4 = last4FromCardNo(card.card_no);
      const isL4Match = slipLast4 ? cardL4 === slipLast4 : false;

      (card.transactions || []).forEach((txn, tIdx) => {
        if (txn.type === 'ชำระเงิน' || txn.type === 'INTEREST') return;
        
        const txnDate = normalizeDate(txn.date);
        const txnAmt = normalizeAmount(txn.amount);
        const descUpper = (txn.desc || '').toUpperCase();
        
        const dateOk = !!slipDate && !!txnDate && slipDate === txnDate;
        const amtOk = !!slipAmount && !!txnAmt && slipAmount === txnAmt;
        const merchOk = hasKeywords && merchantKeywords.some(kw => descUpper.includes(kw));

        // ลำดับความสำคัญ
        let score = 0;
        if (dateOk && amtOk && merchOk && isL4Match) score = 10;
        else if (dateOk && amtOk && merchOk) score = 8; // ร้านตรง + วันที่ตรง + ยอดตรง (น้ำหนักสูงตามลูกค้าร้องขอ)
        else if (dateOk && amtOk && isL4Match) score = 6;
        else if (dateOk && merchOk && isL4Match) score = 5;
        // กรณี amount หาย หรืออ่านไม่ออก
        else if (dateOk && merchOk && !slipAmount) score = 4;

        if (score > 0 && (!matchedTxn || score > (matchedTxn._score || 0))) {
          matchedCard = card;
          matchedTxn = { ...txn, _score: score };
          matchedTxnIndex = tIdx;
          if (!slipLast4) inferredLast4FromCard = cardL4;
        }
      });
    }
  }

  // Final check for UI flags
  const hasCard = !!matchedCard;
  const hasTxn = !!matchedTxn;

  const dateMatch = hasTxn ? normalizeDate(matchedTxn.date) === slipDate : null;
  const amtMatch = hasTxn ? normalizeAmount(matchedTxn.amount) === slipAmount : null;
  
  const txnDesc = hasTxn ? (matchedTxn.desc || '').toUpperCase() : '';
  const merchantMatch = hasTxn && hasKeywords ? merchantKeywords.some(kw => txnDesc.includes(kw)) : (hasKeywords ? false : null);

  const matchedCardL4 = matchedCard ? last4FromCardNo(matchedCard.card_no) : null;
  const last4Match = (hasTxn && slipLast4 && matchedCardL4) ? slipLast4 === matchedCardL4 : (slipLast4 ? false : null);

  return {
    slipDate: pv.date,
    slipAmount: pv.amount,
    slipMerchant,
    slipLast4: slipLast4 || null,
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

