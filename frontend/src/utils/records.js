import { matchSlipToStatement } from './slipPreviewMatch.js';
import { 
    fetchRecords, 
    fetchRecordDetail, 
    saveRecordToDB, 
    deleteRecordFromDB 
} from '../services/api.js';

/**
 * โหลดรายชื่อ Record ทั้งหมดจาก SQLite
 */
export const listRecords = async () => {
    try {
        return await fetchRecords();
    } catch (err) {
        console.error('Error fetching records:', err);
        return [];
    }
};

/**
 * ดึงข้อมูล Record รายการเดียว (รวมรูปภาพถ้ามี)
 */
export const getRecord = async (id) => {
    try {
        return await fetchRecordDetail(id);
    } catch (err) {
        console.error('Error fetching record detail:', err);
        return null;
    }
};

/**
 * ฟังก์ชัน alias เพื่อความเข้ากันได้กับโค้ดเก่าที่ต้องการโหลดรูปด้วย
 */
export async function getRecordWithSlipImages(id) {
    return getRecord(id);
}

/**
 * สร้าง Record ใหม่จากข้อมูล Statement
 */
export const createRecordFromStatement = async (result) => {
    const id = Date.now().toString();
    const record = {
        id,
        filename: result?.filename || '—',
        createdAt: new Date().toISOString(),
        result,
        slipResult: null,
        slipUploads: [],
    };
    await saveRecordToDB(record);
    return record;
};

/**
 * สร้าง Record ใหม่แบบ Manual (ยังไม่มี Statement)
 */
export const createRecordManual = async (name) => {
    const id = Date.now().toString();
    const record = {
        id,
        name: name || 'รายการใหม่', // ใช้ฟิลด์ name สำหรับหน้ารายการ
        filename: name || 'รายการใหม่',
        createdAt: new Date().toISOString(),
        result: null,
        slipResult: null,
        slipUploads: [],
        isNew: true,
    };
    await saveRecordToDB(record);
    return record;
};

export const updateRecordName = async (id, newName) => {
    const record = await getRecord(id);
    if (!record) return null;
    
    record.filename = newName;
    record.name = newName;
    record.updatedAt = new Date().toISOString();
    if (record.isNew) delete record.isNew;
    
    await saveRecordToDB(record);
    return record;
};

export const updateRecordStatement = async (id, result) => {
    const record = await getRecord(id);
    if (!record) return null;
    
    record.result = result;
    record.updatedAt = new Date().toISOString();
    if (record.isNew) delete record.isNew;
    
    await saveRecordToDB(record);
    return record;
};

/**
 * บันทึกผลลัพธ์สลิปที่รวมร่างมาแล้ว (ใช้เมื่อต้องการ Override หรือจัดการ Metadata การอัปโหลด)
 */
export const setRecordSlipResult = async (recordId, mergedSlipResult, slipFileName, newPagesCount) => {
    const record = await getRecord(recordId);
    if (!record) return null;

    const slipUploads = Array.isArray(record.slipUploads) ? [...record.slipUploads] : [];
    slipUploads.push({
        id: Date.now().toString(),
        fileName: slipFileName || '—',
        uploadedAt: new Date().toISOString(),
        pages: newPagesCount ?? (Array.isArray(mergedSlipResult?.pages) ? mergedSlipResult.pages.length : 0),
    });

    record.slipResult = mergedSlipResult;
    record.slipUploads = slipUploads;
    record.updatedAt = new Date().toISOString();

    await saveRecordToDB(record);
    return record;
};

/**
 * แทนที่ slip result ทั้งก้อน (ใช้เมื่อลบหน้ารายการออกจากพรีวิว)
 */
export const replaceRecordSlipResult = async (recordId, newSlipResult) => {
    const record = await getRecord(recordId);
    if (!record) return null;

    record.slipResult = newSlipResult;
    record.updatedAt = new Date().toISOString();
    
    await saveRecordToDB(record);
    return record;
};

export const appendSlipToRecord = async (recordId, slipResult, slipFileName) => {
    const current = await getRecord(recordId);
    if (!current) return null;
    
    const merged = mergeSlipResults(current.slipResult, slipResult);
    const slipUploads = Array.isArray(current.slipUploads) ? [...current.slipUploads] : [];
    slipUploads.push({
        id: Date.now().toString(),
        fileName: slipFileName || '—',
        uploadedAt: new Date().toISOString(),
        pages: Array.isArray(slipResult?.pages) ? slipResult.pages.length : 0,
    });

    current.slipResult = merged;
    current.slipUploads = slipUploads;
    current.updatedAt = new Date().toISOString();

    await saveRecordToDB(current);
    return current;
};

export const deleteRecord = async (recordId) => {
    await deleteRecordFromDB(recordId);
    return listRecords();
};

// --- Helper Functions (Pure Logic) ---

export const mergeSlipResults = (existing, incoming) => {
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
    const hasMerchant = !!m;
    const hasDate = !!d;
    const hasTime = !!t;
    const hasLast4 = /^\d{4}$/.test(l);
    const strongKeyParts = [hasMerchant, hasDate, hasTime, hasLast4].filter(Boolean).length;
    if (strongKeyParts < 3) return `__keep_page_${index}`;
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
    if (/^(PTTST\.D_|PTTRM_)/.test(merchant)) score += 3;
    return score;
}

function matchScoreFromPage(page, statementResult) {
    if (!statementResult?.data) return { score: 0, hasTxn: false, match: null };
    const match = matchSlipToStatement(page, statementResult);
    if (!match) return { score: 0, hasTxn: false, match: null };
    if (match.hasTxn) return { score: 1000, hasTxn: true, match };
    let score = 0;
    if (match.hasCard) score += 120;
    if (match.dateMatch) score += 80;
    if (match.amtMatch) score += 80;
    if (match.merchantMatch) score += 80;
    return { score, hasTxn: false, match };
}

export function dedupeSlipPagesWithReport(pages, statementResult = null) {
    if (!Array.isArray(pages)) return { pages, report: [] };
    const byKey = new Map();

    for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        let k = slipPageKeyWithAmount(p, i);
        if (k.startsWith('__no_amt_key_')) {
            k = slipPageKeyWithoutAmount(p, i);
        }
        const hasImage = !!p?.image;
        const amt = amountAsNumber(p);
        const metrics = { hasImage, amt, quality: qualityScoreFromPage(p) };
        const matchMetrics = matchScoreFromPage(p, statementResult);
        metrics.matchScore = matchMetrics.score;
        metrics.match = matchMetrics.match;

        const existing = byKey.get(k);
        if (!existing) {
            byKey.set(k, { best: p, bestMetrics: metrics, removed: [] });
            continue;
        }

        const existingMetrics = existing.bestMetrics;
        const scoreNew = (metrics.matchScore || 0) * 1 + metrics.quality + (hasImage ? 8 : 0);
        const scoreExisting = (existingMetrics.matchScore || 0) * 1 + existingMetrics.quality + (existingMetrics.hasImage ? 8 : 0);

        const newWins = scoreNew > scoreExisting || (scoreNew === scoreExisting && ((hasImage && !existing.best?.image) || amt < amountAsNumber(existing.best) || (hasImage && amt <= amountAsNumber(existing.best))));

        if (newWins) {
            existing.removed.push({ index: existing.best?.__dedupeIndex ?? i, page: existing.best, reason: 'ข้อมูลใหม่ดีกว่า' });
            existing.best = p;
            existing.bestMetrics = metrics;
        } else {
            existing.removed.push({ index: p?.__dedupeIndex ?? i, page: p, reason: 'ข้อมูลเดิมดีกว่า' });
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
