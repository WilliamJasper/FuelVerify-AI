import React from 'react';
import {
    CheckCircle,
    XCircle,
    Fuel,
    CreditCard,
    Coins,
    CalendarDays,
    CalendarCheck,
    AlignLeft,
    MapPin,
    Tag,
    CircleDollarSign,
} from 'lucide-react';

/**
 * ดึงข้อความหลังตัวเลขกลางในรายการ มาเป็นสาขา
 * เช่น "PTTST.D BANMAI PETROLEUM2 NAKHONRATSIMA" -> "NAKHONRATSIMA"
 * หรือ "PTTRM_KR JORHOR6 NAKHONRATSIMA" -> "NAKHONRATSIMA"
 */
function extractBranch(desc) {
    if (!desc || typeof desc !== 'string') return '';
    const trimmed = desc.trim();
    const match = trimmed.match(/\d+\s+(.+)$/);
    return match ? match[1].trim() : '';
}

/**
 * ตัดข้อความสาขาออกจากรายการ
 * จาก "PTTST.D BANMAI PETROLEUM2 NAKHONRATSIMA" -> "PTTST.D BANMAI PETROLEUM2"
 * จาก "PTTRM_KR JORHOR6 NAKHONRATSIMA" -> "PTTRM_KR JORHOR6"
 */
function extractDescWithoutBranch(desc) {
    if (!desc || typeof desc !== 'string') return '';
    const trimmed = desc.trim();
    const match = trimmed.match(/^(.+?\d+)\s+.+$/);
    return match ? match[1].trim() : trimmed;
}

const TransactionTable = ({ card, txnMatchStatus, slipResult, bank = 'kbank' }) => (
    <div className="rounded-[24px] bg-slate-50 border border-slate-200 overflow-x-auto overflow-y-hidden shadow-inner">
        <table className="w-full text-left min-w-[900px]">
            <thead className="bg-[#1E293B] text-slate-100 text-sm font-bold uppercase tracking-wider">
                <tr>
                    <th className="px-8 py-6 w-16 text-center">#</th>
                    <th className="px-8 py-6">{bank === 'bbl' ? 'วันที่ทำรายการ' : 'วันที่ใช้บัตร'}</th>
                    {bank === 'bbl' && <th className="px-8 py-6">เวลา</th>}
                    <th className="px-8 py-6">วันที่บันทึก</th>
                    <th className="px-8 py-6 min-w-[200px]">รายการ</th>
                    {bank !== 'bbl' && (
                        <th className="px-8 py-6 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-slate-400" /> สาขา
                            </div>
                        </th>
                    )}
                    <th className="px-8 py-6">ประเภท</th>
                    <th className="px-8 py-6 text-right">ยอดเงิน (บาท)</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
                {(card.transactions || []).map((txn, tIdx) => {
                    const isMatched =
                        slipResult?.pages && txnMatchStatus ? txnMatchStatus.get(tIdx) : null;
                    const branch = extractBranch(txn.desc);
                    const descWithoutBranch = extractDescWithoutBranch(txn.desc);
                    const vipMatch = String(card?.account_name || '').match(/\d+/);
                    const vip = vipMatch ? vipMatch[0] : String(card?.card_id || 'unknown');

                    const rowBgClass =
                        isMatched === null
                            ? tIdx % 2 === 0
                                ? 'bg-white hover:bg-blue-50/50'
                                : 'bg-slate-50/80 hover:bg-blue-50/40'
                            : isMatched
                              ? 'bg-gradient-to-r from-emerald-50/80 to-emerald-100/50 hover:from-emerald-100 hover:to-emerald-200/50'
                              : 'bg-gradient-to-r from-red-50/80 to-rose-100/50 hover:from-red-100 hover:to-rose-200/50';

                    const textMainClass =
                        isMatched === null ? 'text-slate-900' : isMatched ? 'text-emerald-800' : 'text-red-700';
                    const textSubClass =
                        isMatched === null
                            ? 'text-slate-700 font-semibold'
                            : isMatched
                              ? 'text-emerald-700 font-semibold'
                              : 'text-red-600 font-semibold';
                    const textDescClass =
                        isMatched === null ? 'text-slate-900 font-semibold' : isMatched ? 'text-emerald-900 font-bold' : 'text-rose-700 font-black';

                    return (
                        <tr
                            key={tIdx}
                            id={`txn-vip-${vip}-${tIdx}`}
                            className={`transition-all duration-300 group border-b border-slate-200/80 last:border-b-0 ${rowBgClass}`}
                        >
                            <td
                                className={`px-8 py-4 text-base font-bold ${
                                    isMatched === null ? 'text-slate-600' : ''
                                }`}
                            >
                                {isMatched === true ? (
                                    <CheckCircle className="w-6 h-6 text-emerald-500 drop-shadow-sm" />
                                ) : isMatched === false ? (
                                    <XCircle className="w-6 h-6 text-red-500 drop-shadow-sm" />
                                ) : (
                                    tIdx + 1
                                )}
                            </td>
                            <td className={`px-8 py-4 text-base font-bold ${textMainClass}`}>
                                {txn.date}
                            </td>
                            {bank === 'bbl' && (
                                <td className={`px-8 py-4 text-base font-bold ${textMainClass}`}>
                                    {txn.time || '-'}
                                </td>
                            )}
                            <td className={`px-8 py-4 text-base ${textSubClass}`}>{txn.post_date}</td>
                            <td className={`px-8 py-4 text-base font-semibold ${textDescClass} align-top`}>
                                <div className="flex items-center gap-3 min-w-0">
                                    {txn.type === 'ชำระเงิน' ? (
                                        <div
                                            className={`p-2 rounded-xl shadow-sm shrink-0 ${
                                                isMatched === null
                                                    ? 'bg-emerald-100 text-emerald-600'
                                                    : isMatched
                                                      ? 'bg-white/60 text-emerald-600'
                                                      : 'bg-white/60 text-red-500'
                                            }`}
                                        >
                                            <CreditCard className="w-4 h-4" />
                                        </div>
                                    ) : txn.type === 'INTEREST' ? (
                                        <div
                                            className={`p-2 rounded-xl shadow-sm shrink-0 ${
                                                isMatched === null
                                                    ? 'bg-amber-100 text-amber-600'
                                                    : isMatched
                                                      ? 'bg-white/60 text-emerald-600'
                                                      : 'bg-white/60 text-red-500'
                                            }`}
                                        >
                                            <Coins className="w-4 h-4" />
                                        </div>
                                    ) : (
                                        <div
                                            className={`p-2 rounded-xl shadow-sm shrink-0 ${
                                                isMatched === null
                                                    ? 'bg-blue-100 text-blue-600'
                                                    : isMatched
                                                      ? 'bg-white/60 text-emerald-600'
                                                      : 'bg-white/60 text-red-500'
                                            }`}
                                        >
                                            <Fuel className="w-4 h-4" />
                                        </div>
                                    )}
                                    <span className="whitespace-nowrap" title={txn.desc}>
                                        {bank === 'bbl' 
                                          ? (txn.branch ? `${txn.desc} ${txn.branch}` : txn.desc)
                                          : descWithoutBranch
                                        }
                                    </span>
                                </div>
                            </td>
                            {bank !== 'bbl' && (
                                <td className={`px-8 py-4 text-base font-semibold align-top whitespace-nowrap ${textDescClass}`}>
                                    {branch || '-'}
                                </td>
                            )}
                            <td className="px-8 py-4 align-top">
                                <span
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
                                        txn.type === 'ชำระเงิน'
                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            : txn.type === 'INTEREST'
                                              ? 'bg-amber-50 text-amber-600 border-amber-200'
                                              : isMatched === true
                                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                : isMatched === false
                                                  ? 'bg-red-100 text-red-700 border-red-200'
                                                  : 'bg-blue-50 text-blue-600 border-blue-100'
                                    }`}
                                >
                                    {txn.type}
                                </span>
                            </td>
                            <td
                                className={`px-8 py-4 text-right font-bold text-lg ${
                                    txn.type === 'ชำระเงิน'
                                        ? 'text-emerald-500'
                                        : isMatched === true
                                          ? 'text-emerald-700'
                                          : isMatched === false
                                            ? 'text-red-600'
                                            : 'text-slate-900'
                                }`}
                            >
                                {txn.type === 'ชำระเงิน' && '-'}
                                {txn.amount}
                            </td>
                        </tr>
                    );
                })}
                {(!card.transactions || card.transactions.length === 0) && (
                    <tr>
                        <td
                            colSpan={bank === 'bbl' ? "7" : "7"}
                            className="px-8 py-16 text-center text-slate-600 font-bold italic tracking-widest uppercase"
                        >
                            ไม่พบรายการเคลื่อนไหวในรอบบิลนี้
                        </td>
                    </tr>
                )}
            </tbody>
        </table>

        <div className="bg-slate-100 px-8 py-8 flex justify-end items-center gap-16 border-t-2 border-slate-300">
            <div className="flex items-center gap-4">
                <span className="text-slate-700 text-sm font-bold uppercase tracking-widest">
                    {bank === 'bbl' ? 'วงเงิน:' : 'ยอดก่อนหน้า:'}
                </span>
                <span className="text-slate-900 font-black text-2xl tracking-tighter">
                    ฿{bank === 'bbl' ? card.credit_limit : card.previous_balance}
                </span>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-slate-700 text-sm font-bold uppercase tracking-widest">
                    {bank === 'bbl' ? 'ยอดเงินรวมทั้งสิ้น (Total Amount):' : 'ยอดคงค้างรวม:'}
                </span>
                <div className="px-6 py-3 bg-white border border-blue-200 rounded-[20px] shadow-sm">
                    <span className="text-blue-700 font-black text-3xl tracking-tighter">
                        ฿{card.total_balance_calc}
                    </span>
                </div>
            </div>
        </div>
    </div>
);

export default TransactionTable;
