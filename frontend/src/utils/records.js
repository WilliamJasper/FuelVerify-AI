import { matchSlipToStatement } from './slipPreviewMatch.js';

const STORAGE_KEY = 'fuelverify_records_v1';
const IDB_NAME = 'FuelVerifyAI';
const IDB_STORE = 'slipImages';

const safeParse = (raw, fallback) => {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

function openIDB() {
    return new Promise((resolve, reject) => {
        const r = indexedDB.open(IDB_NAME, 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => resolve(r.result);
        r.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains(IDB_STORE)) {
                e.target.result.createObjectStore(IDB_STORE);
            }
        };
    });
}

/** บันทึกรูปสลิปเต็ม (รวม base64) ลง IndexedDB */
export function setSlipImagesToIDB(recordId, fullSlipResult) {
    if (!recordId || !fullSlipResult) return Promise.resolve();
    return openIDB()
        .then((db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                store.put(fullSlipResult, recordId);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        })
        .catch(() => {});
}

/** โหลดรูปสลิปเต็มจาก IndexedDB */
export function getSlipImagesFromIDB(recordId) {
    if (!recordId) return Promise.resolve(null);
    return openIDB()
        .then((db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const req = store.get(recordId);
                req.onsuccess = () => resolve(req.result ?? null);
                req.onerror = () => reject(req.error);
            });
        })
        .catch(() => null);
}

/** ลบรูปสลิปของรายการ (เมื่อลบรายการ) */
export function deleteSlipImagesFromIDB(recordId) {
    if (!recordId) return Promise.resolve();
    return openIDB()
        .then((db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).delete(recordId);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        })
        .catch(() => {});
}

/** โหลด record พร้อมรูปสลิปจาก IDB (async) */
export async function getRecordWithSlipImages(id) {
    const record = getRecord(id);
    if (!record) return null;
    const fullSlip = await getSlipImagesFromIDB(id);
    if (fullSlip && Array.isArray(fullSlip.pages) && fullSlip.pages.length > 0) {
        return { ...record, slipResult: fullSlip };
    }
    return record;
}

export const listRecords = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = safeParse(raw, []);
    return Array.isArray(list) ? list : [];
};

export const getRecord = (id) => listRecords().find((r) => r.id === id) || null;

export const upsertRecords = (records) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

export const createRecordFromStatement = (result) => {
    const id = Date.now().toString();
    const record = {
        id,
        filename: result?.filename || '—',
        createdAt: new Date().toISOString(),
        result,
        slipResult: null,
        slipUploads: [],
    };
    const next = [record, ...listRecords()];
    upsertRecords(next);
    return record;
};

/**
 * Normalize ค่าจากสลิปเพื่อจับคู่ข้อมูลเดียวกันที่ถ่ายคนละรูป/คนละมุม
 * (ร้านอาจเขียนต่างกันเล็กน้อย วันที่/เวลาอาจมีรูปแบบต่างกัน ยอดอาจมี/ไม่มีทศนิยม)
 */
function normalizeForDedupe(value, type) {
    const s = (value ?? '').toString().trim();
    if (type === 'merchant') {
        const collapsed = s.replace(/\s+/g, ' ').trim();
        const withoutPrefix = collapsed.replace(/^(PTTST\.?D_?|PTTRM_?)\s*/i, '');
        const core = (withoutPrefix || collapsed).toLowerCase();
        return core.slice(0, 14).trim();
    }
    if (type === 'date') {
        const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (match) {
            const [, d, m, y] = match;
            const yy = y.length === 4 ? y.slice(-2) : y;
            return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${yy}`;
        }
        return s.replace(/-/g, '/');
    }
    if (type === 'time') {
        const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (match) {
            const [, h, m, sec = '00'] = match;
            return `${h.padStart(2, '0')}:${m}:${sec.padStart(2, '0')}`;
        }
        return s;
    }
    if (type === 'last4') {
        const digits = s.replace(/\D/g, '');
        return digits.slice(-4);
    }
    if (type === 'amount') {
        const num = parseFloat(s.replace(/,/g, ''));
        if (Number.isNaN(num)) return s;
        return num.toFixed(2);
    }
    return s;
}

function slipPageKeyWithoutAmount(page, index = 0) {
    const v = page?.values ?? {};
    const m = normalizeForDedupe(v.merchant, 'merchant');
    const d = normalizeForDedupe(v.date, 'date');
    const t = normalizeForDedupe(v.time, 'time');
    const l = normalizeForDedupe(v.last4, 'last4');
    // คัดออกเฉพาะ "ซ้ำจริง" เท่านั้น:
    // ถ้าข้อมูลหลักยังไม่ครบพอ ให้ถือว่าเป็นหน้าคนละใบเพื่อไม่ให้หายจากพรีวิว
    const hasMerchant = !!m;
    const hasDate = !!d;
    const hasTime = !!t;
    const hasLast4 = /^\d{4}$/.test(l);
    const strongKeyParts = [hasMerchant, hasDate, hasTime, hasLast4].filter(Boolean).length;
    if (strongKeyParts < 3) {
        return `__keep_page_${index}`;
    }
    return `${m}|${d}|${t}|${l}`;
}

function slipPageKeyWithAmount(page, index = 0) {
    const v = page?.values ?? {};
    const m = normalizeForDedupe(v.merchant, 'merchant');
    const d = normalizeForDedupe(v.date, 'date');
    const t = normalizeForDedupe(v.time, 'time');
    const a = normalizeForDedupe(v.amount, 'amount');
    if (!m || !d || !t || !a) return `__no_amt_key_${index}`;
    return `${m}|${d}|${t}|AMT:${a}`;
}

function amountAsNumber(page) {
    const a = page?.values?.amount;
    if (a == null) return Infinity;
    const n = parseFloat(String(a).replace(/,/g, ''));
    return Number.isNaN(n) ? Infinity : n;
}

/**
 * คัดหน้าซ้ำจาก key ร้าน+วันที่+เวลา+เลข 4 ตัว (ไม่ใช้ยอด — กรณียอดถูกอ่านผิดเป็น AVAILABLE BALANCE ก็ยังตัดซ้ำได้)
 * เมื่อซ้ำ: เก็บหน้าที่มีรูป และ/หรือ ยอดน้อยกว่า (ยอดน้อย = TOTAL จริง, ยอดมาก = มักเป็น balance)
 */
export function dedupeSlipPages(pages) {
    return dedupeSlipPagesWithReport(pages).pages;
}

function qualityScoreFromPage(page) {
    const v = page?.values || {};
    let score = 0;

    const merchant = (v.merchant || '').toString().trim();
    if (merchant) score += 18;

    const date = (v.date || '').toString().trim();
    if (date) score += 12;

    const time = (v.time || '').toString().trim();
    if (time) score += 4;

    const last4 = (v.last4 || '').toString().replace(/\D/g, '');
    if (/^\d{4}$/.test(last4)) score += 16;

    const amt = amountAsNumber(page);
    if (Number.isFinite(amt) && amt > 0 && amt <= 500_000) score += 14;

    // ถ้าเป็นรูปแบบร้านที่เรารู้จัก (มี prefix) จะยิ่งน่าเชื่อถือ
    if (/^(PTTST\.D_|PTTRM_)/.test(merchant)) score += 3;

    return score;
}

function matchScoreFromPage(page, statementResult) {
    if (!statementResult?.data) return { score: 0, hasTxn: false, match: null };

    // ใช้ logic เดียวกันกับหน้า SlipPreview
    const match = matchSlipToStatement(page, statementResult);
    if (!match) return { score: 0, hasTxn: false, match: null };

    // ถ้า match ได้ทั้งรายการ (hasTxn) ให้ให้คะแนนสูงมากเพื่อเลือกค่าที่ถูกที่สุด
    if (match.hasTxn) return { score: 1000, hasTxn: true, match };

    let score = 0;
    if (match.hasCard) score += 120;
    if (match.dateMatch) score += 80;
    if (match.amtMatch) score += 80;
    if (match.merchantMatch) score += 80;
    return { score, hasTxn: false, match };
}

/**
 * dedupe ที่เลือก “หน้าที่ดีที่สุด” โดยอิงจาก
 * - match กับ statement (ถ้ามี result)
 * - ความครบของฟิลด์สำคัญ
 * - มีรูปภาพประกอบ
 * - และ tie-break สุดท้ายใช้ยอดน้อยกว่า (มักเป็น TOTAL)
 *
 * คืนค่า report เพื่อใช้แจ้งผู้ใช้ว่าคัดออกอะไร/เพราะอะไร
 */
export function dedupeSlipPagesWithReport(pages, statementResult = null) {
    if (!Array.isArray(pages)) return { pages, report: [] };

    const byKey = new Map();

    for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        // ใช้ key ที่มี amount ก่อน เพื่อคัดหน้าซ้ำที่ last4 OCR เพี้ยน
        // (เช่น merchant/date/time/amount เดิม แต่ last4 อ่านผิด)
        let k = slipPageKeyWithAmount(p, i);
        if (k.startsWith('__no_amt_key_')) {
            k = slipPageKeyWithoutAmount(p, i);
        }
        const hasImage = !!p?.image;
        const amt = amountAsNumber(p);

        const metrics = {
            hasImage,
            amt,
            quality: qualityScoreFromPage(p),
        };
        const matchMetrics = matchScoreFromPage(p, statementResult);
        metrics.matchScore = matchMetrics.score;
        metrics.match = matchMetrics.match;

        const existing = byKey.get(k);
        if (!existing) {
            byKey.set(k, { best: p, bestMetrics: metrics, removed: [] });
            continue;
        }

        const existingMetrics = existing.bestMetrics;

        // รวมคะแนน: ถ้ามี match จะ dominate
        const scoreNew = (metrics.matchScore || 0) * 1 + metrics.quality + (hasImage ? 8 : 0);
        const scoreExisting =
            (existingMetrics.matchScore || 0) * 1 + existingMetrics.quality + (existingMetrics.hasImage ? 8 : 0);

        const newWins =
            scoreNew > scoreExisting ||
            (scoreNew === scoreExisting &&
                ((hasImage && !existing.best?.image) ||
                    amt < amountAsNumber(existing.best) ||
                    (hasImage && amt <= amountAsNumber(existing.best))));

        if (newWins) {
            // เก็บหน้าที่โดนคัดออก
            const loser = existing.best;
            const loserMetrics = existing.bestMetrics;

            let reason = 'คัดออกเพราะคุณภาพ/ข้อมูลไม่ครบ';
            if (statementResult) {
                if (loserMetrics.match?.hasTxn && !metrics.match?.hasTxn) {
                    reason = 'คัดออกเพราะเป็นข้อมูลซ้ำ และหน้าใหม่คุณภาพดีกว่า';
                } else if (!loserMetrics.match?.hasTxn && metrics.match?.hasTxn) {
                    reason = 'คัดออกเพราะเป็นข้อมูลซ้ำ และหน้าใหม่จับคู่ได้ชัดกว่า';
                } else if ((loserMetrics.matchScore || 0) < (metrics.matchScore || 0)) {
                    reason = 'คัดออกเพราะเป็นข้อมูลซ้ำ และหน้าใหม่มีคะแนนรวมดีกว่า';
                }
            }

            if (!statementResult || !reason) {
                if (!hasImage && existing.best?.image) reason = 'คัดออกเพราะหน้าเดิมมีรูปสลิปชัดกว่า';
            }

            // ถ้ายังไม่ชัด ลองใช้ tie-break จากยอด
            if (statementResult && reason === 'คัดออกเพราะคุณภาพ/ข้อมูลไม่ครบ') {
                const existingAmt = amountAsNumber(existing.best);
                const existingHasImage = !!existing.best?.image;
                if (hasImage && !existingHasImage) reason = 'คัดออกเพราะหน้าที่ใหม่มีรูปสลิปชัดกว่า';
                else if (amt < existingAmt) reason = 'คัดออกเพราะเลือกยอด TOTAL (น้อยกว่า)';
            }

            existing.removed.push({
                index: loser?.__dedupeIndex ?? i,
                page: loser,
                reason,
            });

            existing.best = p;
            existing.bestMetrics = metrics;
        } else {
            let reason = 'คัดออกเพราะคุณภาพ/ข้อมูลไม่ครบ';
            if (statementResult) {
                if (!metrics.match?.hasTxn && existingMetrics.match?.hasTxn) {
                    reason = 'คัดออกเพราะเป็นข้อมูลซ้ำ และหน้าเดิมจับคู่ได้ชัดกว่า';
                } else if ((metrics.matchScore || 0) < (existingMetrics.matchScore || 0)) {
                    reason = 'คัดออกเพราะเป็นข้อมูลซ้ำ และหน้าเดิมมีคะแนนรวมดีกว่า';
                }
            }

            if (!statementResult || reason === 'คัดออกเพราะคุณภาพ/ข้อมูลไม่ครบ') {
                const existingAmt = amountAsNumber(existing.best);
                if (!hasImage && existing.best?.image) reason = 'คัดออกเพราะหน้าที่ใหม่ไม่มีรูปสลิป';
                else if (amt > existingAmt) reason = 'คัดออกเพราะเลือกยอด TOTAL (น้อยกว่า)';
            }

            existing.removed.push({
                index: p?.__dedupeIndex ?? i,
                page: p,
                reason,
            });
        }
    }

    const pagesOut = [];
    const report = [];
    for (const v of byKey.values()) {
        pagesOut.push(v.best);
        for (const r of v.removed) report.push(r);
    }

    return { pages: pagesOut, report };
}

const mergeSlipResults = (existing, incoming) => {
    if (!existing) return incoming || null;
    if (!incoming) return existing;
    const exPages = Array.isArray(existing.pages) ? existing.pages : [];
    const inPages = Array.isArray(incoming.pages) ? incoming.pages : [];
    const pages = dedupeSlipPages([...exPages, ...inPages]);
    return {
        ...existing,
        ...incoming,
        pages,
        total_pages: pages.length,
    };
};

/**
 * ลบ base64 image ออกจากแต่ละหน้า เพื่อให้บันทึกลง localStorage ได้ (ไม่เกิน quota)
 * เก็บเฉพาะ values และ highlights สำหรับจับคู่งานและแสดงข้อมูล
 */
function stripSlipImages(slipResult) {
    if (!slipResult || !Array.isArray(slipResult.pages)) return slipResult;
    const pages = slipResult.pages.map((p) => ({
        values: p.values,
        correctedValues: p.correctedValues,
        manualValues: p.manualValues,
        manualEditMeta: p.manualEditMeta,
        correction: p.correction,
        quality: p.quality,
        highlights: p.highlights,
    }));
    return {
        ...slipResult,
        pages,
        total_pages: pages.length,
    };
}

/**
 * Save already-merged slip result to a record (used when frontend merges first).
 * บันทึกแบบไม่เก็บรูป (strip image) เพื่อไม่ให้ localStorage เต็ม
 */
export const setRecordSlipResult = (recordId, mergedSlipResult, slipFileName, newPagesCount) => {
    const records = listRecords();
    const idx = records.findIndex((r) => r.id === recordId);
    if (idx === -1) return null;

    const current = records[idx];
    const slipUploads = Array.isArray(current.slipUploads)
        ? [...current.slipUploads]
        : [];
    slipUploads.push({
        id: Date.now().toString(),
        fileName: slipFileName || '—',
        uploadedAt: new Date().toISOString(),
        pages: newPagesCount ?? (Array.isArray(mergedSlipResult?.pages) ? mergedSlipResult.pages.length : 0),
    });

    const toSave = stripSlipImages(mergedSlipResult);
    const updated = {
        ...current,
        slipResult: toSave,
        slipUploads,
        updatedAt: new Date().toISOString(),
    };

    const next = [...records];
    next[idx] = updated;
    upsertRecords(next);
    setSlipImagesToIDB(recordId, mergedSlipResult);
    return updated;
};

export const appendSlipToRecord = (recordId, slipResult, slipFileName) => {
    const current = getRecord(recordId);
    if (!current) return null;
    const merged = mergeSlipResults(current.slipResult, slipResult);
    const newPagesCount = Array.isArray(slipResult?.pages) ? slipResult.pages.length : 0;
    return setRecordSlipResult(recordId, merged, slipFileName, newPagesCount);
};

/**
 * แทนที่ slip result ทั้งก้อน (ใช้เมื่อลบหน้ารายการออกจากพรีวิว)
 */
export const replaceRecordSlipResult = (recordId, newSlipResult) => {
    const records = listRecords();
    const idx = records.findIndex((r) => r.id === recordId);
    if (idx === -1) return null;
    const current = records[idx];
    const toSave = stripSlipImages(newSlipResult);
    const updated = {
        ...current,
        slipResult: newSlipResult ? toSave : null,
        updatedAt: new Date().toISOString(),
    };
    const next = [...records];
    next[idx] = updated;
    upsertRecords(next);
    if (newSlipResult && Array.isArray(newSlipResult.pages) && newSlipResult.pages.length > 0) {
        setSlipImagesToIDB(recordId, newSlipResult);
    } else {
        deleteSlipImagesFromIDB(recordId);
    }
    return updated;
};

export const deleteRecord = (recordId) => {
    deleteSlipImagesFromIDB(recordId);
    const next = listRecords().filter((r) => r.id !== recordId);
    upsertRecords(next);
    return next;
};
