import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, CreditCard } from 'lucide-react';
import TransactionTable from './TransactionTable.jsx';
import { doesPageMatchTxn } from '../utils/matching.js';

function computeTxnMatchStatus(card, slipResult, globalUsedSlipIndices) {
    const txnMatchStatus = new Map();
    if (!slipResult?.pages) return txnMatchStatus;

    (card.transactions || []).forEach((txn, tIdx) => {
        // ชำระเงิน และ INTEREST CHARGE ไม่นำมาพิจารณาจับคู่สลิป แสดงเป็นแถวปกติ ไม่ขึ้นสัญลักษณ์แดง
        if (txn.type === 'ชำระเงิน' || txn.type === 'INTEREST') {
            txnMatchStatus.set(tIdx, null);
            return;
        }
        const matchIdx = slipResult.pages.findIndex((page, pIdx) => {
            if (globalUsedSlipIndices.has(pIdx)) return false;
            return doesPageMatchTxn(page, card, txn).match;
        });

        if (matchIdx !== -1) {
            globalUsedSlipIndices.add(matchIdx);
            txnMatchStatus.set(tIdx, true);
        } else {
            txnMatchStatus.set(tIdx, false);
        }
    });

    return txnMatchStatus;
}

/** หา index ใน baseCards จาก label สรุป (ชื่อบัตร / VIP / เลข 4 ตัวท้าย) */
function findCardIndexInBase(baseCards, label, vip) {
    const l = String(label || '').trim().toLowerCase();
    if (!l && !Number.isFinite(vip)) return -1;

    let idx = baseCards.findIndex(
        (c) => String(c?.account_name || '').trim().toLowerCase() === l,
    );
    if (idx >= 0) return idx;

    if (Number.isFinite(vip)) {
        idx = baseCards.findIndex((c) => {
            const m = String(c?.account_name || '').match(/\d+/);
            const v = m ? parseInt(m[0], 10) : NaN;
            return v === vip;
        });
        if (idx >= 0) return idx;
        idx = baseCards.findIndex((c) => {
            const idNum = parseInt(String(c?.card_id ?? '').replace(/\D/g, ''), 10);
            return Number.isFinite(idNum) && idNum === vip;
        });
        if (idx >= 0) return idx;
    }

    const digits = l.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    if (last4.length === 4) {
        idx = baseCards.findIndex((c) => (c.card_no || '').replace(/\D/g, '').endsWith(last4));
        if (idx >= 0) return idx;
    }

    return -1;
}

function scrollCardHeaderIntoView(card, anchorIdFor) {
    const tryScroll = () => {
        const headerEl = document.getElementById(`${anchorIdFor(card)}-header`);
        if (headerEl) {
            headerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return true;
        }
        const wrap = document.getElementById(anchorIdFor(card));
        if (wrap) {
            wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return true;
        }
        return false;
    };
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (tryScroll()) return;
            setTimeout(() => tryScroll(), 150);
        });
    });
}

const CardList = ({ result, slipResult }) => {
    const [expandedCards, setExpandedCards] = useState(() => new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [open, setOpen] = useState(true);

    const toggleCard = (idx) => {
        setExpandedCards((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const baseCards = useMemo(() => {
        if (!result?.data) return [];
        const extractVipNumber = (card) => {
            const fromName = String(card?.account_name || '').match(/\d+/);
            if (fromName) return parseInt(fromName[0], 10);
            const fromId = String(card?.card_id || '').match(/\d+/);
            if (fromId) return parseInt(fromId[0], 10);
            return Number.POSITIVE_INFINITY;
        };

        // จัดเรียงให้ VIP 110 โผล่ตามลำดับ (กันกรณีข้อมูลมาไม่เรียง)
        return [...result.data].sort((a, b) => extractVipNumber(a) - extractVipNumber(b));
    }, [result]);

    const filteredCards = useMemo(() => {
        if (!baseCards?.length) return [];
        if (!searchQuery.trim()) return baseCards;
        const q = searchQuery.trim().toLowerCase();
        return baseCards.filter((card) => {
            const name = (card.account_name || '').toLowerCase();
            const digits = (card.card_no || '').replace(/\D/g, '');
            const last4 = digits.slice(-4);
            return name.includes(q) || last4.includes(q);
        });
    }, [baseCards, searchQuery]);

    const anchorIdFor = (card) => {
        const name = String(card?.account_name || '');
        const m = name.match(/\d+/);
        if (m) return `card-vip-${m[0]}`;
        const id = String(card?.card_id || '').match(/\d+/);
        if (id) return `card-vip-${id[0]}`;
        const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `card-${safe || 'unknown'}`;
    };

    useEffect(() => {
        const onFocus = (e) => {
            const label = e?.detail?.label;
            const vip = e?.detail?.vip;

            setSearchQuery('');
            setOpen(true);

            const idx = findCardIndexInBase(baseCards, label, vip);
            if (idx === -1) return;

            setExpandedCards(new Set([idx]));
            scrollCardHeaderIntoView(baseCards[idx], anchorIdFor);
        };

        window.addEventListener('fuelverify:focus-card', onFocus);
        return () => window.removeEventListener('fuelverify:focus-card', onFocus);
    }, [baseCards]);

    useEffect(() => {
        const onFocusTxn = (e) => {
            const label = e?.detail?.label;
            const vip = e?.detail?.vip;
            const txnIndex = e?.detail?.txnIndex;
            if (!Number.isFinite(txnIndex)) return;

            setSearchQuery('');
            setOpen(true);

            const idx = findCardIndexInBase(baseCards, label, vip);
            if (idx === -1) return;

            setExpandedCards(new Set([idx]));

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const tryRow = () => {
                        const vipStr = Number.isFinite(vip)
                            ? String(vip)
                            : String(baseCards[idx]?.account_name || '').match(/\d+/)?.[0] ||
                              String(baseCards[idx]?.card_id || 'unknown');
                        const row = document.getElementById(`txn-vip-${vipStr}-${txnIndex}`);
                        if (row) {
                            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            row.classList.add('ring-4', 'ring-blue-200');
                            setTimeout(() => row.classList.remove('ring-4', 'ring-blue-200'), 1200);
                            return true;
                        }
                        return false;
                    };
                    if (tryRow()) return;
                    setTimeout(() => {
                        if (tryRow()) return;
                        scrollCardHeaderIntoView(baseCards[idx], anchorIdFor);
                    }, 150);
                });
            });
        };

        window.addEventListener('fuelverify:focus-txn', onFocusTxn);
        return () => window.removeEventListener('fuelverify:focus-txn', onFocusTxn);
    }, [baseCards]);

    const usedSlipIndicesRef = useRef(new Set());

    return (
        <div className="bg-gradient-to-r from-amber-200 via-sky-200 to-violet-200 p-[1px] rounded-[34px] shadow-sm" id="cardlist-section">
        <div className="bg-white rounded-[33px] p-6 md:p-8">
        <div className="space-y-6">
            <div className="px-4 mb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-1.5 h-6 bg-amber-400 rounded-full"></div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-amber-500" />
                                <h3 className="text-xl font-black text-slate-900">
                                    รายละเอียดแยกตามลำดับบัตร
                                </h3>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">
                                ดูรายละเอียดและผลการจับคู่รายบัตร
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            className="mt-1 ml-1 p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
                            title={open ? 'พับ' : 'ขยาย'}
                        >
                            <ChevronDown className={`w-5 h-5 transition-transform ${open ? '' : '-rotate-90'}`} />
                        </button>
                    </div>
                    <div className={`w-full md:w-[360px] ${open ? '' : 'opacity-0 pointer-events-none'} transition-opacity duration-200`}>
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="ค้นหาชื่อบัตร หรือเลข 4 ตัวท้าย..."
                                className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 bg-white shadow-sm"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className={`transition-all duration-300 ${open ? 'opacity-100 max-h-[20000px]' : 'opacity-0 max-h-0 overflow-hidden pointer-events-none'}`}>
            {filteredCards.length === 0 && (
                <div className="px-4 py-10 text-center text-slate-600 text-base italic">
                    ไม่พบบัตรที่ตรงกับคำค้นหา
                </div>
            )}

            {filteredCards.map((item, idx) => {
                if (idx === 0) usedSlipIndicesRef.current.clear();
                const txnMatchStatus = computeTxnMatchStatus(
                    item,
                    slipResult,
                    usedSlipIndicesRef.current,
                );

                return (
                    <div
                        key={idx}
                        id={anchorIdFor(item)}
                        className={`bg-white border border-slate-200 rounded-[32px] transition-all duration-500 overflow-hidden shadow-sm hover:shadow-[0_15px_30px_rgb(0,0,0,0.06)] ${
                            expandedCards.has(idx)
                                ? 'ring-4 ring-blue-50 border-blue-300 -translate-y-1'
                                : 'hover:border-slate-300'
                        }`}
                    >
                        <div
                            id={`${anchorIdFor(item)}-header`}
                            onClick={() => toggleCard(idx)}
                            className="scroll-mt-28 p-8 flex justify-between items-center cursor-pointer group active:scale-[0.99] transition-transform duration-300"
                        >
                            <div className="flex items-center gap-8">
                                <div className="w-16 h-16 bg-gradient-to-br from-amber-300 to-orange-400 rounded-2xl flex items-center justify-center font-black text-white text-2xl shadow-[0_8px_20px_rgb(251,191,36,0.4)] group-hover:scale-105 group-hover:shadow-[0_12px_25px_rgb(251,191,36,0.6)] group-hover:-rotate-3 transition-all duration-500">
                                    {item.card_id}
                                </div>
                                <div>
                                    <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-1 group-hover:text-blue-600 transition-colors">
                                        {item.account_name}
                                    </h4>
                                    <p className="text-slate-600 font-mono text-sm tracking-widest">
                                        {item.card_no}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-12">
                                <div className="text-right">
                                    <p className="text-slate-600 text-xs font-bold uppercase tracking-widest mb-1">
                                        รายการ
                                    </p>
                                    <p className="text-2xl font-black text-slate-800">
                                        {item.transaction_count}
                                    </p>
                                </div>
                                <div className="text-right min-w-[180px]">
                                    <p className="text-slate-600 text-xs font-bold uppercase tracking-widest mb-1">
                                        ยอดคงค้าง
                                    </p>
                                    <p className="text-3xl font-black text-emerald-700">
                                        ฿{item.balance}
                                    </p>
                                </div>
                                <div
                                    className={`w-12 h-12 rounded-full border border-slate-200 flex items-center justify-center transition-all duration-500 ${
                                        expandedCards.has(idx) ? 'rotate-180 bg-slate-100' : 'text-slate-300'
                                    }`}
                                >
                                    <ChevronDown className="w-6 h-6" />
                                </div>
                            </div>
                        </div>

                        <div
                            className={`transition-all duration-500 ease-in-out ${
                                expandedCards.has(idx)
                                    ? 'max-h-[2000px] opacity-100 pb-10 px-10'
                                    : 'max-h-0 opacity-0 overflow-hidden'
                            }`}
                        >
                            <TransactionTable
                                card={item}
                                txnMatchStatus={txnMatchStatus}
                                slipResult={slipResult}
                            />
                        </div>
                    </div>
                );
            })}
            </div>
        </div>
        </div>
        </div>
    );
};

export default CardList;
