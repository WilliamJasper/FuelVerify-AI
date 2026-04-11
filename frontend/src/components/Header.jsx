import React from 'react';
import { Fuel, Plus } from 'lucide-react';

const Header = ({ result, onReset, recordsDropdown, bank = 'kbank' }) => {
    const isBBL = bank === 'bbl';
    const primaryColor = isBBL ? 'blue' : 'emerald';
    const primaryHex = isBBL ? '#2563EB' : '#00A950'; // blue-600 or kbank-green
    const bankLabel = isBBL ? 'BBL Statement' : 'KBank Statement';

    return (
        <header className="px-12 py-6 flex justify-between items-center border-b border-slate-200 bg-white/90 backdrop-blur-xl sticky top-0 z-40 shadow-sm font-sans">
            <div className="flex items-center gap-5">
                <div className={`w-12 h-12 bg-gradient-to-br ${isBBL ? 'from-blue-600 to-blue-700' : 'from-[#00A950] to-[#008f45]'} rounded-xl flex items-center justify-center shadow-lg ${isBBL ? 'shadow-blue-300/40' : 'shadow-emerald-300/40'} rotate-3 transition-all duration-500`}>
                    <Fuel className="text-white w-7 h-7" />
                </div>
                <div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 font-display">
                            FuelVerify <span style={{ color: primaryHex }}>AI</span>
                        </h1>
                        {result?.filename && (
                            <span className={`text-xs font-bold text-${primaryColor}-700 bg-${primaryColor}-50 border border-${primaryColor}-100 px-3 py-1 rounded-full animate-in fade-in duration-500`}>
                                ข้อมูลจาก {result.filename}
                            </span>
                        )}
                    </div>
                    <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.25em]">
                        {bankLabel} OCR Engine
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right border-r border-slate-200 pr-8">
                    <p className="text-slate-600 text-xs font-semibold uppercase tracking-widest mb-1">สถานะระบบ</p>
                    <div className="text-emerald-700 text-sm font-bold flex items-center justify-end gap-2 font-display">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-emerald-200"></span>
                        {result ? (
                            <>ประมวลผลสำเร็จ <span className="text-emerald-800">{result.count || 0}</span> รายการ</>
                        ) : (
                            <>ระบบพร้อมใช้งาน</>
                        )}
                    </div>
                </div>
                {recordsDropdown}
                {onReset && (
                    <button
                        onClick={onReset}
                        className={`p-3 bg-slate-100 hover:bg-${primaryColor}-50 rounded-xl transition-all border border-slate-200 hover:border-${primaryColor}-200 group`}
                    >
                        <Plus className={`w-5 h-5 text-slate-600 group-hover:text-${primaryColor}-600 group-hover:rotate-90 transition-transform`} />
                    </button>
                )}
            </div>
        </header>
    );
};

export default Header;
