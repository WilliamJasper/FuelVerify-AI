import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Plus, ArrowUp } from 'lucide-react';
import { getSlipProgress, uploadSlip } from '../services/api.js';
import { matchSlipToStatement } from '../utils/slipPreviewMatch.js';
import { autoCorrectSlipPages } from '../utils/slipAutoCorrect.js';
import {
    dedupeSlipPages,
    dedupeSlipPagesWithReport,
    getRecord,
    getRecordWithSlipImages,
    replaceRecordSlipResult,
    setRecordSlipResult,
} from '../utils/records.js';
import Header from '../components/Header.jsx';
import SummaryCards from '../components/SummaryCards.jsx';
import UploadSlip from '../components/UploadSlip.jsx';
import CardList from '../components/CardList.jsx';
import RecordsDropdown from '../components/RecordsDropdown.jsx';
import SummarySection from '../components/SummarySection.jsx';

const DashboardKBANK = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const topRef = useRef(null);
    const [record, setRecord] = useState(null);
    const result = record?.result || null;

    const [slipFiles, setSlipFiles] = useState([]);
    const [slipLoading, setSlipLoading] = useState(false);
    const [slipProgress, setSlipProgress] = useState(null);
    const [slipResult, setSlipResult] = useState(null);
    const [slipError, setSlipError] = useState(null);
    const [dedupeWarnings, setDedupeWarnings] = useState([]);
    const [uploadMatchedCards, setUploadMatchedCards] = useState([]);
    /** วินาทีที่ใช้พรีวิว/อ่านสลิปรอบล่าสุด (แสดงแจ้งเตือนหลังสำเร็จ) */
    const [lastSlipPreviewSeconds, setLastSlipPreviewSeconds] = useState(null);
    const [slipPage, setSlipPage] = useState(0);
    const slipInputRef = useRef(null);
    const slipAbortRef = useRef(null);
    const slipProgressIntervalRef = useRef(null);
    const slipUploadStartRef = useRef(null);
    const [isSlipDragActive, setIsSlipDragActive] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            if (!id) return;
            setIsLoading(true);
            try {
                const full = await getRecordWithSlipImages(id);
                if (!full) {
                    navigate('/', { replace: true });
                    return;
                }
                
                // Reset states for new record
                setSlipPage(0);
                setSlipError(null);
                setDedupeWarnings([]);
                setUploadMatchedCards([]);
                setSlipFiles([]);

                if (full?.slipResult?.pages?.length) {
                    const pages = full.slipResult.pages;
                    const deduped = dedupeSlipPages(pages);
                    if (deduped.length < pages.length) {
                        const newSlipResult = { ...full.slipResult, pages: deduped, total_pages: deduped.length };
                        const updated = await replaceRecordSlipResult(full.id, newSlipResult);
                        setRecord(updated || full);
                        setSlipResult(newSlipResult);
                    } else {
                        setRecord(full);
                        setSlipResult(full.slipResult);
                    }
                } else {
                    setRecord(full);
                    setSlipResult(null);
                }
            } catch (err) {
                console.error('Failed to load record:', err);
                navigate('/', { replace: true });
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [id, navigate]);

    const handleSlipFileChange = (e) => {
        if (e.target.files?.length > 0) {
            const incoming = Array.from(e.target.files);
            const dedupeKey = (f) =>
                `${f?.name || ''}|${f?.size ?? ''}|${f?.lastModified ?? ''}|${f?.type || ''}`;
            setSlipFiles((prev) => {
                const prevKeys = new Set((prev || []).map(dedupeKey));
                const next = [...(prev || [])];
                for (const f of incoming) {
                    const k = dedupeKey(f);
                    if (!prevKeys.has(k)) {
                        prevKeys.add(k);
                        next.push(f);
                    }
                }
                return next;
            });
            setSlipError(null);
        }
    };

    const handleRemoveSlipFile = (fileIndex) => {
        setSlipFiles((prev) => (Array.isArray(prev) ? prev.filter((_, i) => i !== fileIndex) : prev));
        setSlipError(null);
    };

    const handleSlipUpload = async () => {
        if (!slipFiles?.length) return;
        setSlipLoading(true);
        setSlipError(null);
        setSlipProgress(null);
        setDedupeWarnings([]);
        setUploadMatchedCards([]);
        setLastSlipPreviewSeconds(null);
        const taskId = Date.now().toString();
        slipUploadStartRef.current = Date.now();
        const fileList = [...slipFiles];
        let uploadPageSeq = 0;
        const controller = new AbortController();
        slipAbortRef.current = controller;

        const progressInterval = setInterval(async () => {
            try {
                const data = await getSlipProgress(taskId);
                if (data != null) {
                    const elapsedSec = Math.max(
                        0,
                        Math.floor((Date.now() - (slipUploadStartRef.current || Date.now())) / 1000),
                    );
                    setSlipProgress((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  pageCurrent: data.current ?? 0,
                                  pageTotal: data.total ?? 0,
                                  elapsedSec,
                              }
                            : null,
                    );
                }
            } catch (_) {}
        }, 1000);
        slipProgressIntervalRef.current = progressInterval;

        try {
            const existingSlip = slipResult ?? record?.slipResult ?? null;
            const existingPages = Array.isArray(existingSlip?.pages) ? existingSlip.pages : [];
            let allNewPages = [];

            for (let i = 0; i < fileList.length; i++) {
                if (controller.signal.aborted) break;
                const file = fileList[i];
                setSlipProgress({
                    fileIndex: i + 1,
                    fileTotal: fileList.length,
                    fileName: file.name,
                    pageCurrent: 0,
                    pageTotal: 0,
                    elapsedSec: Math.max(
                        0,
                        Math.floor((Date.now() - (slipUploadStartRef.current || Date.now())) / 1000),
                    ),
                });
                const data = await uploadSlip(file, taskId, controller.signal);
                if (controller.signal.aborted) break;
                const newPages = Array.isArray(data?.pages) ? data.pages : [];
                const annotatedPages = newPages.map((p) => ({
                    ...p,
                    __uploadFileName: file.name,
                    __uploadFileIndex: i + 1,
                    __uploadPageSeq: uploadPageSeq++,
                    __uploadTaskId: taskId,
                }));
                allNewPages.push(...annotatedPages);
            }

            clearInterval(progressInterval);
            slipProgressIntervalRef.current = null;
            const previewSeconds = Math.max(
                0,
                Math.floor((Date.now() - (slipUploadStartRef.current || Date.now())) / 1000),
            );
            setSlipProgress(null);
            slipUploadStartRef.current = null;

            if (controller.signal.aborted) {
                setSlipLoading(false);
                slipAbortRef.current = null;
                return;
            }

            const combinedPages = [...existingPages, ...allNewPages].map((p, idx) => ({
                ...p,
                __dedupeIndex: idx,
            }));

            const { pages: dedupedPages, report } = dedupeSlipPagesWithReport(combinedPages, result);

            const uploadRemoved = Array.isArray(report)
                ? report
                      .filter((r) => r?.page?.__uploadTaskId === taskId)
                      .map((r) => ({
                          fileName: r.page.__uploadFileName,
                          uploadPageSeq: r.page.__uploadPageSeq,
                          reason: r.reason || 'คัดออก',
                      }))
                : [];

            setDedupeWarnings(uploadRemoved);

            const keptUploadPages = dedupedPages.filter((p) => p?.__uploadTaskId === taskId);

            // แสดงผลจาก "ไฟล์ที่อัปโหลดรอบนี้" เท่านั้น เพื่อให้ตัวเลขตรงกับพรีวิวที่ผู้ใช้เพิ่งอัปโหลด
            const matchedByCard = new Map();
            for (const p of keptUploadPages) {
                const m = matchSlipToStatement(p, result);
                if (!m?.hasTxn || !m?.matchedCard?.account_name || !Number.isFinite(m?.matchedTxnIndex)) continue;
                const label = m.matchedCard.account_name;
                const vipM = String(label).match(/\d+/);
                const vip = vipM ? parseInt(vipM[0], 10) : Number.NaN;
                const cardKey = label.toLowerCase();
                const existing = matchedByCard.get(cardKey);
                if (!existing) {
                    matchedByCard.set(cardKey, { label, vip, txnIndex: m.matchedTxnIndex, count: 1 });
                } else {
                    existing.count += 1;
                }
            }
            setUploadMatchedCards(Array.from(matchedByCard.values()).sort((a, b) => (a.vip - b.vip) || a.label.localeCompare(b.label)));

            const correctedPages = autoCorrectSlipPages(dedupedPages, result);
            const merged = existingSlip
                ? { ...existingSlip, pages: correctedPages, total_pages: correctedPages.length }
                : {
                    pages: correctedPages,
                    total_pages: correctedPages.length,
                };
            const newPagesCount = correctedPages.length - existingPages.length;
            const slipLabel = fileList.length === 1 ? fileList[0].name : `${fileList.length} ไฟล์`;

            let updatedRecord = record ? { ...record, slipResult: merged } : record;
            if (record) {
                try {
                    const updated = await setRecordSlipResult(
                        record.id,
                        merged,
                        slipLabel,
                        newPagesCount,
                    );
                    if (updated) updatedRecord = updated;
                } catch (err) {
                    console.error('Failed to sync slip result to SQLite:', err);
                }
            }

            setRecord(updatedRecord);
            setSlipResult(merged);
            setSlipPage(0);
            setSlipFiles([]);
            if (slipInputRef.current) slipInputRef.current.value = '';
            setLastSlipPreviewSeconds(previewSeconds);
            setSlipLoading(false);
        } catch (err) {
            if (slipProgressIntervalRef.current) {
                clearInterval(slipProgressIntervalRef.current);
                slipProgressIntervalRef.current = null;
            }
            slipAbortRef.current = null;
            setSlipProgress(null);
            slipUploadStartRef.current = null;
            setSlipLoading(false);
            const isCancel = err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';
            if (!isCancel) {
                setSlipError(err.response?.data?.detail || 'เกิดข้อผิดพลาดในการอ่านสลิป');
            }
        }
    };

    const handleCancelSlipUpload = () => {
        if (slipAbortRef.current) {
            slipAbortRef.current.abort();
            slipAbortRef.current = null;
        }
        if (slipProgressIntervalRef.current) {
            clearInterval(slipProgressIntervalRef.current);
            slipProgressIntervalRef.current = null;
        }
        setSlipProgress(null);
        slipUploadStartRef.current = null;
        setSlipLoading(false);
        setSlipError(null);
    };

    const triggerSlipInput = () => slipInputRef.current?.click();

    const handleSlipDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsSlipDragActive(false);
        if (e.dataTransfer?.files?.length > 0) {
            const incoming = Array.from(e.dataTransfer.files);
            const dedupeKey = (f) =>
                `${f?.name || ''}|${f?.size ?? ''}|${f?.lastModified ?? ''}|${f?.type || ''}`;
            setSlipFiles((prev) => {
                const prevKeys = new Set((prev || []).map(dedupeKey));
                const next = [...(prev || [])];
                for (const f of incoming) {
                    const k = dedupeKey(f);
                    if (!prevKeys.has(k)) {
                        prevKeys.add(k);
                        next.push(f);
                    }
                }
                return next;
            });
            setSlipError(null);
        }
    };

    const handleSlipDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsSlipDragActive(true);
    };

    const handleSlipDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsSlipDragActive(false);
    };

    const reset = () => {
        navigate('/');
    };

    const removeSlipPage = async (pageIndex) => {
        if (!record || !slipResult?.pages?.length) return;
        const pages = slipResult.pages.filter((_, i) => i !== pageIndex);
        if (pages.length === 0) {
            const updated = await replaceRecordSlipResult(record.id, null);
            setRecord(updated || record);
            setSlipResult(null);
            setSlipPage(0);
            return;
        }
        const newSlipResult = { ...slipResult, pages, total_pages: pages.length };
        const updated = await replaceRecordSlipResult(record.id, newSlipResult);
        setRecord(updated || record);
        setSlipResult(newSlipResult);
        setSlipPage(Math.min(slipPage, pages.length - 1));
    };

    const removeAllSlipPages = async () => {
        if (!record || !slipResult?.pages?.length) return;
        const updated = await replaceRecordSlipResult(record.id, null);
        setRecord(updated || record);
        setSlipResult(null);
        setSlipPage(0);
    };

    const handleManualSlipEdit = async (pageIndex, editedValues) => {
        if (!record || !slipResult?.pages?.length) return;
        const pages = slipResult.pages.map((p, idx) => {
            if (idx !== pageIndex) return p;
            const nextManual = {
                merchant: (editedValues?.merchant ?? '').toString().trim(),
                date: (editedValues?.date ?? '').toString().trim(),
                time: (editedValues?.time ?? '').toString().trim(),
                last4: (editedValues?.last4 ?? '').toString().replace(/\D/g, '').slice(-4),
                amount: (editedValues?.amount ?? '').toString().trim(),
            };
            return {
                ...p,
                manualValues: nextManual,
                manualEditMeta: {
                    editedAt: new Date().toISOString(),
                    editedBy: 'user',
                },
            };
        });
        const newSlipResult = { ...slipResult, pages, total_pages: pages.length };
        const updated = await replaceRecordSlipResult(record.id, newSlipResult);
        setRecord(updated || record);
        setSlipResult(newSlipResult);
    };

    const totalAmount =
        result?.data?.reduce((acc, curr) => {
            const val = parseFloat((curr.balance || '').replace(/,/g, '')) || 0;
            return acc + val;
        }, 0) ?? 0;

    const totalTransactions =
        result?.data?.reduce((acc, curr) => acc + (curr.transaction_count || 0), 0) ?? 0;

    return (
        <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-20 selection:bg-blue-100">
            <Header
                result={result}
                onReset={() => navigate('/')}
                recordsDropdown={<RecordsDropdown label="รายการ" variant="light" />}
                bank="kbank"
            />

            <main
                key={id}
                className="max-w-[1400px] mx-auto px-12 py-12 page-transition"
            >
                <div ref={topRef} />

                <SummaryCards
                    result={result}
                    totalTransactions={totalTransactions}
                    totalAmount={totalAmount}
                />

                <UploadSlip
                    slipFiles={slipFiles}
                    slipLoading={slipLoading}
                    slipProgress={slipProgress}
                    slipError={slipError}
                    slipResult={slipResult}
                    slipPage={slipPage}
                    setSlipPage={setSlipPage}
                    result={result}
                    isSlipDragActive={isSlipDragActive}
                    slipInputRef={slipInputRef}
                    onSlipFileChange={handleSlipFileChange}
                    onSlipDrop={handleSlipDrop}
                    onSlipDragOver={handleSlipDragOver}
                    onSlipDragLeave={handleSlipDragLeave}
                    triggerSlipInput={triggerSlipInput}
                    onSlipUpload={handleSlipUpload}
                    onCancelSlipUpload={handleCancelSlipUpload}
                    dedupeWarnings={dedupeWarnings}
                    uploadMatchedCards={uploadMatchedCards}
                    lastSlipPreviewSeconds={lastSlipPreviewSeconds}
                    onDismissSlipPreviewTime={() => setLastSlipPreviewSeconds(null)}
                    onRemoveSlipFile={handleRemoveSlipFile}
                    onRemoveSlipPage={removeSlipPage}
                    onRemoveAllSlipPages={removeAllSlipPages}
                    onManualSlipEdit={handleManualSlipEdit}
                />

                <CardList result={result} slipResult={slipResult} />

                <SummarySection result={result} slipResult={slipResult} />
            </main>

            <button
                type="button"
                onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="fixed bottom-8 right-8 z-40 w-12 h-12 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition-transform flex items-center justify-center"
                title="กลับขึ้นด้านบน"
            >
                <ArrowUp className="w-6 h-6" />
            </button>
        </div>
    );
};

export default DashboardKBANK;
