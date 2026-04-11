import React from 'react';
import { CreditCard, ListOrdered, Wallet } from 'lucide-react';

const CountUp = ({ end, duration = 1000, formatter = (n) => n }) => {
    const [count, setCount] = React.useState(0);

    React.useEffect(() => {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            setCount(progress * end);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }, [end, duration]);

    return <>{formatter(count)}</>;
};

const formatBaht = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return '—';
    return (
        num.toLocaleString('th-TH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }) + ' ฿'
    );
};

const SummaryCards = ({ 
    result, 
    totalTransactions, 
    totalAmount,
    amountLabel = "ยอดคงค้างรวม",
    amountSublabel = "ผลรวม balance จากทุกบัตร"
}) => {
    const cardCount = result?.count ?? result?.data?.length ?? 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        บัตรในใบแจ้งยอด
                    </span>
                </div>
                <p className="text-3xl font-extrabold text-slate-900 font-display tabular-nums">
                    <CountUp end={cardCount} formatter={(n) => Math.floor(n)} />
                </p>
                <p className="text-sm text-slate-500 mt-1">บัตรที่อ่านได้</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <ListOrdered className="w-5 h-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        รายการรวม
                    </span>
                </div>
                <p className="text-3xl font-extrabold text-slate-900 font-display tabular-nums">
                    <CountUp end={totalTransactions} formatter={(n) => Math.floor(n).toLocaleString('th-TH')} />
                </p>
                <p className="text-sm text-slate-500 mt-1">ธุรกรรมทั้งหมดจากทุกบัตร</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-amber-700" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {amountLabel}
                    </span>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display tabular-nums break-all">
                    <CountUp end={totalAmount} formatter={formatBaht} />
                </p>
                <p className="text-sm text-slate-500 mt-1">{amountSublabel}</p>
            </div>
        </div>
    );
};

export default SummaryCards;
