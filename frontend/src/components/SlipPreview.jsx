import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Pencil, Save, X } from 'lucide-react';
import { matchSlipToStatement } from '../utils/slipPreviewMatch.js';

const SlipPreview = ({ slipResult, slipPage, setSlipPage, result, onRemovePage, onRemoveAllPages, onManualEdit }) => {
    if (!slipResult?.pages?.length) return null;

    const currentPage = slipResult.pages[slipPage] || slipResult.pages[0];
    const effectiveValues = currentPage?.manualValues || currentPage?.correctedValues || currentPage?.values || {};
    const totalPages = slipResult.total_pages || slipResult.pages.length;
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState({
        merchant: '',
        date: '',
        time: '',
        last4: '',
        amount: '',
    });

    useEffect(() => {
        setIsEditing(false);
        setDraft({
            merchant: (effectiveValues?.merchant || '').toString(),
            date: (effectiveValues?.date || '').toString(),
            time: (effectiveValues?.time || '').toString(),
            last4: (effectiveValues?.last4 || '').toString(),
            amount: (effectiveValues?.amount || '').toString(),
        });
    }, [slipPage, currentPage?.manualValues, currentPage?.correctedValues, currentPage?.values]);

    const match = matchSlipToStatement({ ...currentPage, values: effectiveValues }, result);
    const {
        slipDate,
        slipAmount,
        slipMerchant,
        slipLast4,
        inferredLast4FromCard,
        matchedCard,
        matchedTxn,
        hasCard,
        hasTxn,
        matchedTxnIndex,
        dateMatch,
        amtMatch,
        merchantMatch,
        last4Match,
    } = match;

    const badge = (ok) =>
        ok === null ? 'text-slate-800' : ok ? 'text-emerald-700' : 'text-red-600';
    const dot = (ok) => (ok === null ? '' : ok ? ' ✅' : ' ❌');
    const timeValid = /^\d{1,2}:\d{2}(?::\d{2})?$/.test((effectiveValues?.time || '').toString().trim());
    const issueFields = [];
    if (merchantMatch === false || !effectiveValues?.merchant) issueFields.push('ร้าน/สาขา');
    if (dateMatch === false || !effectiveValues?.date) issueFields.push('วันที่');
    if (!timeValid) issueFields.push('เวลา');
    if (last4Match === false || !effectiveValues?.last4) issueFields.push('เลข 4 ตัว');
    if (amtMatch === false || !effectiveValues?.amount) issueFields.push('ยอดเงิน');
    if (!hasTxn) issueFields.push('หมายเลขบัตร');


    return (
        <div className="mt-10">
            {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
                    <button
                        onClick={() => setSlipPage(Math.max(0, slipPage - 1))}
                        disabled={slipPage === 0}
                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <div className="flex items-center gap-2">
                        {Array.from({ length: totalPages }, (_, i) => (
                            <button
                                key={i}
                                onClick={() => setSlipPage(i)}
                                className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${
                                    slipPage === i
                                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setSlipPage(Math.min(totalPages - 1, slipPage + 1))}
                        disabled={slipPage === totalPages - 1}
                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                    </button>
                    <span className="text-slate-600 text-sm font-bold">
                        หน้า {slipPage + 1} / {totalPages}
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-50 border border-slate-200 rounded-[28px] p-6">
                    <p className="text-slate-800 text-base font-bold uppercase tracking-widest mb-5">
                        ค่าที่ตรวจพบ {totalPages > 1 ? `(หน้า ${slipPage + 1})` : ''}
                    </p>
                    <div className="mb-4 flex items-center justify-end gap-2">
                        {!isEditing ? (
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-bold"
                                title="แก้ไขข้อมูลหน้านี้"
                            >
                                <Pencil className="w-4 h-4" />
                                แก้ไขข้อมูล
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onManualEdit?.(slipPage, draft);
                                        setIsEditing(false);
                                    }}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-sm font-bold"
                                    title="บันทึกการแก้ไข"
                                >
                                    <Save className="w-4 h-4" />
                                    บันทึก
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsEditing(false);
                                        setDraft({
                                            merchant: (effectiveValues?.merchant || '').toString(),
                                            date: (effectiveValues?.date || '').toString(),
                                            time: (effectiveValues?.time || '').toString(),
                                            last4: (effectiveValues?.last4 || '').toString(),
                                            amount: (effectiveValues?.amount || '').toString(),
                                        });
                                    }}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-bold"
                                    title="ยกเลิกการแก้ไข"
                                >
                                    <X className="w-4 h-4" />
                                    ยกเลิก
                                </button>
                            </>
                        )}
                    </div>
                    <div className="text-base divide-y divide-slate-200 rounded-xl overflow-hidden border border-slate-200">
                        <div className="flex justify-between gap-4 items-center py-3.5 px-4 bg-slate-50/80">
                            <span className="text-slate-700 font-semibold text-lg shrink-0">ร้าน/สาขา</span>
                            {isEditing ? (
                                <input
                                    value={draft.merchant}
                                    onChange={(e) => setDraft((d) => ({ ...d, merchant: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            onManualEdit?.(slipPage, draft);
                                            setIsEditing(false);
                                        }
                                    }}
                                    className="w-[65%] px-3 py-2 rounded-lg border border-slate-300 text-right font-bold"
                                />
                            ) : (
                                <span className={`text-right text-lg font-bold ${badge(merchantMatch)}`}>
                                    {slipMerchant || '-'}
                                    {dot(merchantMatch)}
                                </span>
                            )}
                        </div>
                        <div className="flex justify-between gap-4 items-center py-3.5 px-4 bg-white">
                            <span className="text-slate-700 font-semibold text-lg shrink-0">วันที่</span>
                            {isEditing ? (
                                <input
                                    value={draft.date}
                                    onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            onManualEdit?.(slipPage, draft);
                                            setIsEditing(false);
                                        }
                                    }}
                                    placeholder="dd/mm/yy"
                                    className="w-[45%] px-3 py-2 rounded-lg border border-slate-300 text-right font-bold"
                                />
                            ) : (
                                <span className={`text-right text-lg font-bold ${badge(dateMatch)}`}>
                                    {slipDate || '-'}
                                    {dot(dateMatch)}
                                </span>
                            )}
                        </div>
                        <div className="flex justify-between gap-4 items-center py-3.5 px-4 bg-slate-50/80">
                            <span className="text-slate-700 font-semibold text-lg shrink-0">เวลา</span>
                            {isEditing ? (
                                <input
                                    value={draft.time}
                                    onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            onManualEdit?.(slipPage, draft);
                                            setIsEditing(false);
                                        }
                                    }}
                                    placeholder="HH:MM:SS"
                                    className="w-[40%] px-3 py-2 rounded-lg border border-slate-300 text-right font-bold"
                                />
                            ) : (
                                <span className="text-slate-900 font-bold text-lg">
                                    {effectiveValues?.time || '-'}
                                </span>
                            )}
                        </div>
                        <div className="flex justify-between gap-4 items-center py-3.5 px-4 bg-white">
                            <span className="text-slate-700 font-semibold text-lg shrink-0">เลข 4 ตัว</span>
                            {isEditing ? (
                                <input
                                    value={draft.last4}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            last4: (e.target.value || '').replace(/\D/g, '').slice(0, 4),
                                        }))
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            onManualEdit?.(slipPage, draft);
                                            setIsEditing(false);
                                        }
                                    }}
                                    className="w-[35%] px-3 py-2 rounded-lg border border-slate-300 text-right font-bold"
                                />
                            ) : (
                                <div className="text-right min-w-0">
                                    <span className={`text-lg font-bold ${badge(last4Match)}`}>
                                        {slipLast4 || '-'}
                                        {last4Match === null ? '' : last4Match ? ' ✅' : ' ❌'}
                                    </span>
                                    {!slipLast4 && inferredLast4FromCard && (
                                        <div className="text-xs text-slate-500 font-medium mt-1 max-w-[220px] ml-auto">
                                            เลขท้ายจากบัตรในรายการที่จับคู่: {inferredLast4FromCard}{' '}
                                            <span className="text-amber-700">(ไม่พบบนสลิป)</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between gap-4 items-center py-3.5 px-4 bg-slate-50/80">
                            <span className="text-slate-700 font-semibold text-lg shrink-0">ยอดเงิน</span>
                            {isEditing ? (
                                <input
                                    value={draft.amount}
                                    onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            onManualEdit?.(slipPage, draft);
                                            setIsEditing(false);
                                        }
                                    }}
                                    placeholder="เช่น 500.00"
                                    className="w-[45%] px-3 py-2 rounded-lg border border-slate-300 text-right font-bold"
                                />
                            ) : (
                                <span className={`text-right text-lg font-bold ${badge(amtMatch)}`}>
                                    {slipAmount || '-'}
                                    {dot(amtMatch)}
                                </span>
                            )}
                        </div>
                        <div className="flex justify-between gap-4 items-center py-3.5 px-4 bg-white border-t-2 border-slate-300">
                            <span className="text-slate-700 font-semibold text-lg shrink-0">หมายเลขบัตร</span>
                            <span
                                className={`font-bold text-right text-lg ${
                                    hasCard ? 'text-emerald-700' : 'text-slate-600'
                                }`}
                            >
                                {hasCard ? matchedCard.account_name : slipLast4 || inferredLast4FromCard ? 'ไม่พบรายการ' : '-'}
                            </span>
                        </div>
                        {hasCard && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (!hasTxn || !Number.isFinite(matchedTxnIndex)) return;
                                    const label = matchedCard?.account_name;
                                    const m = String(label || '').match(/\d+/);
                                    const vip = m ? parseInt(m[0], 10) : Number.NaN;
                                    document.getElementById('cardlist-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    window.dispatchEvent(
                                        new CustomEvent('fuelverify:focus-txn', { detail: { label, vip, txnIndex: matchedTxnIndex } }),
                                    );
                                }}
                                className={`mt-4 p-4 rounded-xl text-sm font-bold text-center w-full ${
                                    hasTxn
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors'
                                        : 'bg-red-50 text-red-600 border border-red-200 cursor-default'
                                }`}
                                title={hasTxn ? 'คลิกเพื่อไปยังรายการในรายละเอียดแยกตามลำดับบัตร' : undefined}
                            >
                                {hasTxn
                                    ? `✅ พบรายการตรงกันใน ${matchedCard.account_name} (คลิกเพื่อไปยังรายการ)`
                                    : `❌ ไม่พบรายการนี้ใน ${matchedCard.account_name}`}
                            </button>
                        )}
                        {issueFields.length > 0 && (
                            <div className="mt-4 p-3 rounded-xl text-sm border bg-red-50 border-red-200 text-red-700">
                                <div className="font-bold">⚠ หน้านี้มีข้อมูลที่ยังไม่ตรง/ไม่ครบ</div>
                                <div className="mt-1">
                                    {issueFields.map((f) => `• ${f}`).join('  ')}
                                </div>
                            </div>
                        )}
                        {currentPage?.manualEditMeta?.editedAt && hasTxn && (
                            <div className="mt-4 p-3 rounded-xl text-sm border bg-emerald-50 border-emerald-200 text-emerald-800">
                                <div className="font-bold">✅ หลังแก้ไขข้อมูลแล้ว ระบบจับคู่ได้สำเร็จ</div>
                                <div className="mt-1">
                                    เจอรายการ: {(matchedTxn?.desc || '-')} | วันที่ {(matchedTxn?.date || '-')} | ยอด {(matchedTxn?.amount || '-')}
                                </div>
                            </div>
                        )}
                        {(currentPage?.correction?.applied || currentPage?.quality?.needs_review) && (
                            <div
                                className={`mt-4 p-3 rounded-xl text-sm border ${
                                    currentPage?.quality?.needs_review
                                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                                        : 'bg-blue-50 border-blue-200 text-blue-800'
                                }`}
                            >
                                {currentPage?.correction?.applied && (
                                    <div className="font-semibold">
                                        ปรับค่าจาก statement อัตโนมัติ: {(currentPage.correction.reasons || []).join(', ')}
                                    </div>
                                )}
                                {currentPage?.quality?.needs_review && (
                                    <div className="font-semibold">
                                        ควรตรวจทาน: {((currentPage.quality.reasons || []).slice(0, 3)).join(', ')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-[28px] p-6 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <p className="text-slate-800 text-base font-bold uppercase tracking-widest">
                            พรีวิว {totalPages > 1 ? `(หน้า ${slipPage + 1})` : ''}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {onRemoveAllPages && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (window.confirm(`ลบทุกหน้าออกจากรายการพรีวิว? (${totalPages} หน้า)`)) {
                                            onRemoveAllPages();
                                        }
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 font-medium text-sm transition-colors"
                                    title="ลบทุกหน้า"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    ลบทุกหน้า
                                </button>
                            )}
                            {onRemovePage && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (window.confirm(`ลบหน้านี้ (หน้า ${slipPage + 1}) ออกจากรายการพรีวิว?`)) {
                                            onRemovePage(slipPage);
                                        }
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 font-medium text-sm transition-colors"
                                    title="ลบหน้านี้"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    ลบหน้านี้
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 min-h-[200px] flex items-center justify-center">
                        {currentPage.image ? (
                            <img
                                src={currentPage.image}
                                alt={`Slip preview page ${slipPage + 1}`}
                                className="w-full h-auto block"
                            />
                        ) : (
                            <div className="text-slate-400 text-center py-12 px-6">
                                <p className="font-medium">ไม่มีรูปสลิป</p>
                                <p className="text-sm mt-1">แสดงเฉพาะข้อมูลที่อ่านได้</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SlipPreview;
