import React, { useMemo, useState } from 'react';
import { Upload, Plus, Loader2, AlertCircle, ChevronDown, Trash2, X, CheckCircle2 } from 'lucide-react';
import SlipPreview from './SlipPreview.jsx';
import { matchSlipToStatement } from '../utils/slipPreviewMatch.js';

const UploadSlip = ({
    slipFiles = [],
    slipLoading,
    slipProgress,
    slipError,
    slipResult,
    slipPage,
    setSlipPage,
    result,
    isSlipDragActive,
    slipInputRef,
    onSlipFileChange,
    onSlipDrop,
    onSlipDragOver,
    onSlipDragLeave,
    triggerSlipInput,
    onSlipUpload,
    onCancelSlipUpload,
    onRemoveSlipPage,
    onRemoveAllSlipPages,
    onManualSlipEdit,
    onRemoveSlipFile,
    dedupeWarnings = [],
    uploadMatchedCards = [],
    lastSlipPreviewSeconds = null,
    onDismissSlipPreviewTime,
}) => {
    const [open, setOpen] = useState(true);
    const formatElapsed = (sec) => {
        const s = Number(sec || 0);
        if (!Number.isFinite(s) || s < 60) return `${Math.max(0, Math.floor(s))} วินาที`;
        if (s < 3600) {
            const m = Math.floor(s / 60);
            const rs = Math.floor(s % 60);
            return rs > 0 ? `${m} นาที ${rs} วินาที` : `${m} นาที`;
        }
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return m > 0 ? `${h} ชั่วโมง ${m} นาที` : `${h} ชั่วโมง`;
    };

    const suspiciousPages = useMemo(() => {
        if (!slipResult?.pages?.length || !result?.data) return [];

        const issues = [];
        for (let pageIndex = 0; pageIndex < slipResult.pages.length; pageIndex++) {
            const page = slipResult.pages[pageIndex];
            const pv = page?.manualValues || page?.correctedValues || page?.values || {};

            const reasons = [];
            const last4Digits = (pv.last4 || '').toString().replace(/\D/g, '');
            const amountNum = parseFloat((pv.amount || '').toString().replace(/,/g, ''));

            if (!pv.merchant) reasons.push('อ่านร้าน/สาขาไม่พบ');
            if (!pv.date) reasons.push('อ่านวันที่ไม่พบ');
            if (!last4Digits || last4Digits.length !== 4) reasons.push('อ่านเลข 4 ตัวไม่ครบ');
            if (!Number.isFinite(amountNum) || amountNum <= 0) reasons.push('อ่านยอดเงินไม่ถูกต้อง');

            const match = matchSlipToStatement({ ...page, values: pv }, result);

            if (reasons.length === 0 && !match.hasTxn) {
                reasons.push(match.hasCard ? 'ไม่พบรายการในบัตรนี้' : 'ไม่พบรายการ/บัตรที่ตรงกัน');
            }

            // ถ้ามี match แล้ว แต่ flag บอกว่าไม่ตรง ให้ถือเป็นหน้าที่น่าสงสัย
            if (reasons.length === 0 && match.hasTxn) {
                if (match.merchantMatch === false) reasons.push('ร้าน/สาขาไม่ตรง');
                if (match.dateMatch === false) reasons.push('วันที่ไม่ตรง');
                if (match.amtMatch === false) reasons.push('ยอดเงินไม่ตรง');
            }

            if (reasons.length > 0) {
                issues.push({ pageIndex, reasons: reasons.slice(0, 3) });
            }
            if (
                Array.isArray(page?.quality?.reasons) &&
                page.quality.reasons.length > 0 &&
                reasons.length === 0 &&
                !match.hasTxn
            ) {
                issues.push({ pageIndex, reasons: page.quality.reasons.slice(0, 3) });
            }
        }

        return issues;
    }, [slipResult, result]);

    return (
        <div className="bg-gradient-to-r from-emerald-200 via-sky-200 to-violet-200 p-[1px] rounded-[34px] mb-12 shadow-sm">
        <div className="bg-white rounded-[33px] p-10 font-sans">
            <div className="flex items-center justify-between gap-3 mb-6">
                <div className="flex items-start gap-3">
                    <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
                    <div>
                        <div className="flex items-center gap-2">
                            <Upload className="w-5 h-5 text-emerald-600" />
                            <h3 className="text-xl font-bold text-slate-800 font-display">
                                อัปโหลดสลิป/ใบเสร็จ เพื่อพรีวิวข้อมูล
                            </h3>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                            รองรับ PDF/รูปภาพ และเลือกหลายไฟล์ได้
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
                    title={open ? 'พับ' : 'ขยาย'}
                >
                    <ChevronDown className={`w-5 h-5 transition-transform ${open ? '' : '-rotate-90'}`} />
                </button>
            </div>

        <div
            className={`transition-all duration-300 ${open ? 'opacity-100 max-h-[5000px]' : 'opacity-0 max-h-0 overflow-hidden pointer-events-none'}`}
        >
        <div
            onClick={triggerSlipInput}
            onDrop={onSlipDrop}
            onDragOver={onSlipDragOver}
            onDragLeave={onSlipDragLeave}
            className={`flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-[32px] cursor-pointer transition-all duration-500 group relative overflow-hidden active:scale-[0.99] ${
                isSlipDragActive
                    ? 'border-blue-400 bg-blue-50/80 shadow-inner'
                    : 'border-slate-300/80 bg-slate-50/50 hover:bg-gradient-to-b hover:from-white hover:to-blue-50/30 hover:border-blue-300 hover:shadow-[0_10px_30px_rgb(59,130,246,0.05)]'
            }`}
        >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"></div>

            <input
                type="file"
                ref={slipInputRef}
                onChange={onSlipFileChange}
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                multiple
            />

            <div className="w-24 h-24 bg-gradient-to-br from-white to-slate-100 rounded-full flex items-center justify-center mb-8 relative border border-slate-200 shadow-[0_8px_20px_rgb(0,0,0,0.04)] group-hover:scale-110 group-hover:shadow-[0_15px_30px_rgb(59,130,246,0.15)] group-hover:border-blue-200 transition-all duration-500">
                <Upload className="w-10 h-10 text-slate-400 group-hover:text-blue-500 transition-colors duration-500" />
                <div className="absolute top-0 right-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center border-2 border-white shadow-md transform rotate-12 group-hover:rotate-0 transition-transform duration-500">
                    <Plus className="w-5 h-5 text-white" />
                </div>
            </div>

            <p className="text-xl font-bold mb-3 text-slate-700 group-hover:text-slate-900 transition-colors">
                ลากไฟล์มาวาง หรือ{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-500 underline decoration-blue-200 underline-offset-8 group-hover:decoration-blue-500 transition-all">
                    คลิกเพื่อเลือกไฟล์
                </span>
            </p>
            <p className="text-slate-600 text-base font-medium tracking-wide">
                {slipFiles?.length > 0 ? (
                    <span className="text-emerald-500 font-bold bg-emerald-50 px-4 py-2 rounded-full">
                        {slipFiles.length === 1
                            ? `📄 ${slipFiles[0].name}`
                            : `📄 เลือกแล้ว ${slipFiles.length} ไฟล์`}
                    </span>
                ) : (
                    'รองรับ PDF/รูปภาพ — ลากไฟล์มาวาง หรือคลิกเพื่อเลือกได้หลายไฟล์'
                )}
            </p>

            {/* ปุ่มเพิ่มไฟล์ถูกซ่อนไว้ เพราะให้คลิกที่กรอบดรอปเพื่อเลือกไฟล์แทน */}
        </div>

        {Array.isArray(slipFiles) && slipFiles.length > 0 && (
            <div className="mt-6">
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-sm font-bold text-slate-800">ไฟล์ที่เลือก</div>
                    <div className="text-xs text-slate-500">{slipFiles.length} รายการ</div>
                </div>
                <div className="space-y-2">
                    {slipFiles.map((f, idx) => (
                        <div
                            key={`${f?.name || 'file'}-${f?.size ?? ''}-${f?.lastModified ?? idx}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-800 truncate">{f?.name || '-'}</div>
                                <div className="text-xs text-slate-500">
                                    {f?.size != null ? `${Math.round(f.size / 1024)} KB` : ''}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onRemoveSlipFile?.(idx)}
                                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
                                title="ลบไฟล์นี้"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* ห้ามซ้อน <button> ใน <button> — เดิมทำให้ปุ่มยกเลิกคลิกไม่ได้ */}
        {slipLoading ? (
            <div
                className="w-full mt-8 py-5 rounded-2xl font-black text-lg shadow-sm bg-slate-100 text-slate-600 flex flex-col items-center justify-center gap-1"
                role="status"
                aria-busy="true"
                aria-label="กำลังอ่านสลิป"
            >
                <div className="flex flex-col items-center justify-center gap-2 fade-in w-full px-4">
                    <div className="flex items-center justify-between gap-4 w-full min-w-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Loader2 className="w-5 h-5 animate-spin text-emerald-500 shrink-0" />
                            <span className="text-emerald-600 font-medium text-left truncate">
                                กำลังอ่านไฟล์ <span className="font-bold text-emerald-700">{slipProgress?.fileName ?? '…'}</span>
                                {slipProgress?.fileTotal > 1 && (
                                    <span className="text-emerald-600/90"> (ไฟล์ที่ {slipProgress.fileIndex}/{slipProgress.fileTotal})</span>
                                )}
                                {slipProgress?.pageTotal > 1 && (
                                    <span className="text-emerald-600/90">
                                        {' '}
                                        — ความคืบหน้า {Math.min(slipProgress.pageCurrent || 0, slipProgress.pageTotal)}/
                                        {slipProgress.pageTotal} หน้า
                                    </span>
                                )}
                                {slipProgress?.elapsedSec >= 0 && (
                                    <span className="text-emerald-600/90"> — ใช้เวลาอ่าน: {formatElapsed(slipProgress.elapsedSec)}</span>
                                )}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onCancelSlipUpload?.();
                            }}
                            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 font-medium text-sm transition-colors ml-2"
                            title="ยกเลิกการแสกน"
                        >
                            <X className="w-4 h-4" />
                            ยกเลิก
                        </button>
                    </div>
                </div>
            </div>
        ) : (
            <button
                type="button"
                onClick={onSlipUpload}
                disabled={!slipFiles?.length}
                className={`w-full mt-8 py-5 rounded-2xl font-black text-lg transition-all duration-300 flex flex-col items-center justify-center gap-1 shadow-sm ${
                    slipFiles?.length > 0
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-[0_8px_20px_rgb(16,185,129,0.3)] hover:shadow-[0_12px_25px_rgb(16,185,129,0.4)] hover:-translate-y-1 active:scale-95'
                        : 'bg-slate-100 text-slate-500 cursor-not-allowed'
                }`}
            >
                <div className="flex items-center gap-3">
                    <div className="opacity-60">🔎</div>
                    <span>พรีวิวข้อมูลจากสลิป</span>
                </div>
            </button>
        )}

        {slipError && (
            <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center gap-3">
                <AlertCircle className="shrink-0" />
                <span className="font-medium text-sm">{slipError}</span>
            </div>
        )}

        {lastSlipPreviewSeconds != null && Number.isFinite(lastSlipPreviewSeconds) && (
            <div
                className="mt-6 p-4 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 flex items-start gap-3 shadow-sm"
                role="status"
            >
                <CheckCircle2 className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-sky-900">พรีวิวไฟล์ที่สแกนเสร็จแล้ว</p>
                    <p className="text-sm text-sky-800 mt-1">
                        การอ่าน/พรีวิวสลิปรอบนี้ใช้เวลารวมประมาณ{' '}
                        <span className="font-black text-sky-950">{formatElapsed(lastSlipPreviewSeconds)}</span>
                    </p>
                </div>
                {typeof onDismissSlipPreviewTime === 'function' && (
                    <button
                        type="button"
                        onClick={onDismissSlipPreviewTime}
                        className="shrink-0 p-2 rounded-lg border border-sky-200 bg-white/80 text-sky-700 hover:bg-white text-xs font-bold"
                        title="ปิดการแจ้งเตือน"
                    >
                        ปิด
                    </button>
                )}
            </div>
        )}

        {Array.isArray(dedupeWarnings) && dedupeWarnings.length > 0 && (
            <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-sm">คัดหน้าที่ซ้ำ/อ่านผิดออกจากพรีวิว</p>
                            <p className="text-xs text-amber-700 mt-0.5">
                                คัดออกแล้ว {dedupeWarnings.length} หน้า (ใช้ข้อมูลที่ถูกที่สุด)
                            </p>
                        </div>
                    </div>
                    <span className="text-xs font-bold bg-white/70 border border-amber-200 px-2 py-1 rounded-full">
                        {dedupeWarnings.length} รายการ
                    </span>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                    {dedupeWarnings.slice(0, 6).map((w, idx) => (
                        <div
                            key={`${w.fileName}-${w.uploadPageSeq}-${idx}`}
                            className="text-xs text-amber-900 bg-white/60 border border-amber-100 rounded-lg px-3 py-2"
                        >
                            <div className="font-bold">{w.fileName}</div>
                            <div className="text-amber-800 mt-0.5">
                                คัดออกหน้า {w.uploadPageSeq + 1} : {w.reason}
                            </div>
                        </div>
                    ))}
                    {dedupeWarnings.length > 6 && (
                        <div className="text-xs text-amber-700 mt-1">
                            และอีก {dedupeWarnings.length - 6} รายการ
                        </div>
                    )}
                </div>
            </div>
        )}

        {Array.isArray(uploadMatchedCards) && uploadMatchedCards.length > 0 && (
            <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-sm">อัปโหลดแล้วพบรายการตรงกันในบัตร</p>
                            <p className="text-xs text-emerald-700 mt-0.5">สรุปจากไฟล์ที่อัปโหลดรอบล่าสุด (หลังคัดซ้ำแล้ว)</p>
                        </div>
                    </div>
                    <span className="text-xs font-bold bg-white/70 border border-emerald-200 px-2 py-1 rounded-full">
                        {uploadMatchedCards.length} บัตร
                    </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    {uploadMatchedCards.map((c) => (
                        <button
                            key={c.label}
                            type="button"
                            onClick={() => {
                                document.getElementById('cardlist-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                window.dispatchEvent(
                                    new CustomEvent('fuelverify:focus-txn', {
                                        detail: { label: c.label, vip: c.vip, txnIndex: c.txnIndex },
                                    }),
                                );
                            }}
                            className="px-3 py-2 rounded-xl bg-white border border-emerald-200 hover:bg-emerald-100 transition-colors text-sm font-bold"
                            title="ไปยังรายการที่พบ"
                        >
                            {c.label}
                            {c.count > 1 && <span className="ml-2 text-xs font-black text-emerald-700">+{c.count}</span>}
                        </button>
                    ))}
                </div>
            </div>
        )}

        {suspiciousPages.length > 0 && (
            <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-sm">พบหน้าที่น่าสงสัยจากการอ่านสลิป</p>
                            <p className="text-xs text-amber-700 mt-0.5">กดเพื่อไปดูหน้าในพรีวิว</p>
                        </div>
                    </div>
                    <span className="text-xs font-bold bg-white/70 border border-amber-200 px-2 py-1 rounded-full">
                        {suspiciousPages.length} หน้า
                    </span>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                    {suspiciousPages.map(({ pageIndex, reasons }) => (
                        <button
                            key={pageIndex}
                            type="button"
                            onClick={() => setSlipPage(pageIndex)}
                            className="text-left p-3 rounded-xl border border-amber-200 bg-white/60 hover:bg-white transition-colors"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-bold text-sm">หน้า {pageIndex + 1}</span>
                                <span className="text-xs font-bold bg-amber-100 text-amber-900 px-2 py-1 rounded-full shrink-0">
                                    {reasons[0]}
                                </span>
                            </div>
                            {reasons.length > 1 && (
                                <div className="text-xs text-amber-700 mt-1">
                                    +อีก {reasons.length - 1} เหตุผล
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        )}

        {slipResult?.pages && result && (
            <SlipPreview
                slipResult={slipResult}
                slipPage={slipPage}
                setSlipPage={setSlipPage}
                result={result}
                onRemovePage={onRemoveSlipPage}
                onRemoveAllPages={onRemoveAllSlipPages}
                onManualEdit={onManualSlipEdit}
            />
        )}
        </div>
        </div>
    </div>
    );
};

export default UploadSlip;
