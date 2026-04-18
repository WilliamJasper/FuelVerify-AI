import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Trash2, Pencil, Save, X, FileCheck2, Plus, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { matchSlipToStatement } from '../utils/slipPreviewMatch.js';

const SlipPreview = ({ slipResult, slipPage, setSlipPage, result, onRemovePage, onRemoveAllPages, onManualEdit }) => {
    const navigate = useNavigate();
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


    const [navStart, setNavStart] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [localInvoices, setLocalInvoices] = useState({});
    const [showMissingAlert, setShowMissingAlert] = useState(true);

    // ดึงข้อมูลใบกำกับภาษีจาก SQLite ทุกครั้งที่ ID เปลี่ยน หรือ รีเฟรชหน้า
    useEffect(() => {
        const fetchInvoices = async () => {
            let recordId = result?.id;
            if (!recordId) {
                const urlParts = window.location.pathname.split('/');
                recordId = urlParts[urlParts.length - 1];
            }

            if (!recordId || recordId === 'dashboard') return;

            try {
                const res = await fetch(`http://127.0.0.1:5004/api/invoices/${recordId}`);
                if (res.ok) {
                    const data = await res.json();
                    setLocalInvoices(data);
                }
            } catch (err) {
                console.error('Failed to fetch invoices:', err);
            }
        };

        fetchInvoices();
    }, [result, slipPage]); // ทำงานเมื่อสลับหน้าหรือผลลัพธ์เปลี่ยน

    // ฟังก์ชันอัปโหลดไฟล์ไปยัง Backend
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // ดึง ID จาก result หรือจาก URL (fallback)
        let recordId = result?.id;
        if (!recordId) {
            const urlParts = window.location.pathname.split('/');
            recordId = urlParts[urlParts.length - 1]; // เลข ID ตัวสุดท้ายใน URL
        }

        if (!recordId || recordId === 'dashboard') {
            alert('ไม่สามารถระบุ ID รายการได้ (กรุณารอสักครู่หรือลองรีเฟรชหน้าจอ)');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`http://127.0.0.1:5004/api/invoices/${recordId}/${slipPage}`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (data.status === 'success') {
                setLocalInvoices(prev => ({ ...prev, [slipPage]: data.filename }));
                e.target.value = '';
            } else {
                alert('เกิดข้อผิดพลาด: ' + (data.detail || 'ไม่ทราบสาเหตุ'));
            }
        } catch (err) {
            console.error('Upload failed:', err);
            alert('เชื่อมต่อ Backend ไม่สำเร็จ (Port 5004)');
        }
    };

    // ฟังก์ชันลบไฟล์ออกจาก Backend
    const handleFileDelete = async () => {
        let recordId = result?.id;
        if (!recordId) {
            const urlParts = window.location.pathname.split('/');
            recordId = urlParts[urlParts.length - 1];
        }

        if (!recordId || !window.confirm('ต้องการลบไฟล์ใบกำกับภาษีนี้ใช่หรือไม่?')) return;

        try {
            await fetch(`http://127.0.0.1:5004/api/invoices/${recordId}/${slipPage}`, {
                method: 'DELETE',
            });
            setLocalInvoices(prev => {
                const next = { ...prev };
                delete next[slipPage];
                return next;
            });
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    // ฟังก์ชันเปิดดูรูปใบกำกับภาษี (เปลี่ยนเป็นย้ายหน้าไปหน้า Tax Invoice)
    const handleViewInvoice = () => {
        let recordId = result?.id;
        if (!recordId) {
            const urlParts = window.location.pathname.split('/');
            recordId = urlParts[urlParts.length - 1];
        }
        if (!recordId) return;
        navigate(`/tax-invoice/${recordId}/${slipPage}`);
    };

    // แก้บัค Navigation: ปรับช่วงหน้าให้ขยับทีละ 20 หน้า (Step-based)
    useEffect(() => {
        const currentStep = Math.floor(slipPage / 20) * 20;
        if (navStart !== currentStep) {
            setNavStart(currentStep);
        }
    }, [slipPage, navStart]);

    // คำนวณหน้าที่จะแสดงผล
    const visiblePages = isExpanded 
        ? Array.from({ length: totalPages }, (_, i) => i) // แสดงทั้งหมด
        : Array.from({ length: Math.min(20, totalPages - navStart) }, (_, i) => navStart + i); // แสดงช่วงละ 20

    const currentInvoiceName = localInvoices[slipPage];

    // คำนวณหาเลขหน้าที่ยังไม่ได้แนบใบกำกับภาษี
    const missingInvoicePages = Array.from({ length: totalPages }, (_, i) => i)
        .filter(pageIdx => !localInvoices[pageIdx]);

    return (
        <div className="mt-8 space-y-6">
            {/* แจ้งเตือนหน้าที่ยังไม่แนบใบกำกับภาษี (โครงสร้างตามแบบสีส้ม) */}
            {missingInvoicePages.length > 0 && (
                <div className="w-full animate-in slide-in-from-top duration-300">
                    <div className="bg-rose-50 border border-rose-200 rounded-[28px] overflow-hidden shadow-sm">
                        <button 
                            onClick={() => setShowMissingAlert(!showMissingAlert)}
                            className="w-full flex items-center justify-between p-5 hover:bg-rose-100/50 transition-colors border-b border-rose-100"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-200">
                                    <X size={20} strokeWidth={3} />
                                </div>
                                <div className="text-left">
                                    <p className="text-rose-950 font-black text-lg">พบหน้าที่ยังไม่ได้แนบรูปใบกำกับภาษี <span className="bg-rose-600 text-white px-2.5 py-0.5 rounded-lg ml-1 text-sm">{missingInvoicePages.length} หน้า</span></p>
                                    <p className="text-rose-600/70 text-xs font-bold uppercase tracking-wider">กดเพื่อดูหน้าทั้งหมดในพรีวิว</p>
                                </div>
                            </div>
                            <div className="p-2 rounded-xl bg-white border border-rose-100 text-rose-600 shadow-sm">
                                {showMissingAlert ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </div>
                        </button>
                        
                        {showMissingAlert && (
                            <div className="p-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex flex-col gap-1.5">
                                    {missingInvoicePages.map((pageIdx) => (
                                        <button 
                                            key={pageIdx}
                                            onClick={() => setSlipPage(pageIdx)}
                                            className="group flex items-center justify-between px-5 py-3.5 bg-white border border-rose-100 rounded-2xl hover:bg-rose-600 hover:border-rose-600 transition-all active:scale-[0.99] shadow-sm"
                                        >
                                            <span className="text-rose-900 font-black text-base group-hover:text-white transition-colors">
                                                หน้า {pageIdx + 1}
                                            </span>
                                            <span className="px-3 py-1 bg-rose-100 text-rose-700 rounded-lg text-[13px] font-black group-hover:bg-rose-500 group-hover:text-white transition-all">
                                                ยังไม่แนบรูปใบกำกับภาษี
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {totalPages > 1 && (
                <div className="flex flex-col items-center gap-2 mb-8 w-full">
                    {/* ตัวบอกหน้าย้ายมาด้านบนกึ่งกลาง */}
                    <span className="text-slate-600 text-[13px] font-black bg-white px-4 py-1.5 rounded-full border border-slate-200 shadow-sm shrink-0 whitespace-nowrap">
                        หน้า {slipPage + 1} / {totalPages}
                    </span>

                    <div className={`flex items-start justify-center gap-3 bg-white/50 p-3 rounded-[32px] border border-slate-100 shadow-sm w-fit mx-auto transition-all duration-300 ${isExpanded ? 'max-w-7xl' : ''}`}>
                        <button
                            onClick={() => setSlipPage(Math.max(0, slipPage - 1))}
                            disabled={slipPage === 0}
                            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 shadow-sm"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-600" />
                        </button>
                        
                        <div className={`flex flex-wrap items-center justify-center gap-1.5 px-1 ${isExpanded ? 'flex-1' : ''}`}>
                            {visiblePages.map((i) => (
                                <button
                                    key={i}
                                    onClick={() => setSlipPage(i)}
                                    className={`w-9 h-9 rounded-xl font-bold text-sm transition-all flex items-center justify-center shrink-0 border ${
                                        slipPage === i
                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-100'
                                            : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-200 hover:text-emerald-600'
                                    }`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                            
                            {totalPages > 20 && (
                                <button
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="px-4 py-2 font-black text-xs uppercase tracking-widest text-blue-600 hover:bg-blue-50 rounded-xl transition-all shrink-0 ml-1 border border-blue-100 bg-white"
                                >
                                    {isExpanded ? 'Show less' : 'Show more'}
                                </button>
                            )}
                        </div>

                        <button
                            onClick={() => setSlipPage(Math.min(totalPages - 1, slipPage + 1))}
                            disabled={slipPage === totalPages - 1}
                            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 shadow-sm"
                        >
                            <ChevronRight className="w-5 h-5 text-slate-600" />
                        </button>
                    </div>
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
                        
                        {/* ส่วนแนบรูปภาพใบกำกับภาษีเพิ่มเติม (PERSISTENT & PREMIUM UI) */}
                        <div className="flex justify-between gap-4 items-center py-4 px-4 bg-slate-50/80 border-t border-slate-200">
                            <span className="text-slate-700 font-bold text-lg shrink-0">รูปภาพใบกำกับภาษี</span>
                            <div className="flex items-center gap-2">
                                {!currentInvoiceName ? (
                                    <label className="cursor-pointer group flex items-center gap-2 bg-white border-2 border-blue-100 px-4 py-2.5 rounded-2xl text-blue-600 font-black text-sm hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm active:scale-95">
                                        <Plus size={18} />
                                        <span>เลือกไฟล์</span>
                                        <input 
                                            type="file" 
                                            className="hidden" 
                                            accept=".png,.jpg,.jpeg,.pdf"
                                            onChange={handleFileUpload}
                                        />
                                    </label>
                                ) : (
                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 pl-3 pr-2 py-2 rounded-2xl animate-in fade-in zoom-in duration-300">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                                            <FileCheck2 size={16} />
                                        </div>
                                        <span className="text-sm font-black text-emerald-800 max-w-[120px] truncate" title={currentInvoiceName}>
                                            {currentInvoiceName}
                                        </span>
                                        <div className="flex items-center gap-1 border-l border-emerald-200 ml-1 pl-1">
                                            <button 
                                                onClick={handleViewInvoice}
                                                className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 transition-all"
                                                title="เปิดดูรูป"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button 
                                                onClick={handleFileDelete}
                                                className="p-1.5 rounded-lg text-emerald-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                                title="ลบไฟล์"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
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
