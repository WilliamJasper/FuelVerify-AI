import React from 'react';
import { FileText } from 'lucide-react';
import RecordsDropdown from './RecordsDropdown.jsx';

const LoadingOverlay = ({
    loading,
    loadingProgress,
    loadingStep,
    onCancel,
    cancelLabel = 'ยกเลิก',
}) => {
    if (!loading) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-[#F8FAFC] flex flex-col items-center animate-in fade-in duration-500">
            <div className="w-full bg-[#1E243B] px-8 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#8B5CF6] rounded-xl flex items-center justify-center shadow-lg">
                        <FileText className="text-white w-5 h-5" />
                    </div>
                    <h1 className="text-white font-bold text-xl tracking-wide">
                        FuelVerify AI
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <RecordsDropdown label="รายการ" />
                    <div className="bg-[#2A314C] text-slate-300 px-4 py-2 rounded-lg text-sm border border-slate-600/50">
                        KBank Statement OCR
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto w-full px-8 flex flex-col items-center mt-20">
                <div className="flex justify-between items-center w-full max-w-4xl mb-32 relative">
                    <div className="flex flex-col items-center relative z-10 w-40">
                        <div
                            className={`w-14 h-14 rounded-[20px] flex items-center justify-center text-xl font-bold bg-white shadow-sm border-2 transition-all duration-500 ${
                                loadingStep >= 1
                                    ? 'border-[#00bcd4] text-[#00bcd4]'
                                    : 'border-slate-100 text-slate-300'
                            }`}
                        >
                            1
                        </div>
                        <span
                            className={`mt-4 text-sm font-bold transition-all duration-500 ${
                                loadingStep >= 1
                                    ? 'text-[#00bcd4]'
                                    : 'text-slate-500'
                            }`}
                        >
                            อัปโหลด
                        </span>
                        {loadingStep === 1 && (
                            <span className="text-[12px] text-[#00bcd4] font-medium mt-1 animate-pulse">
                                รอสักครู่...
                            </span>
                        )}
                    </div>

                    <div className="flex-1 h-[2px] -ml-8 -mr-8 -mt-10 relative z-0 bg-slate-200">
                        <div
                            className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ${
                                loadingStep >= 2
                                    ? 'bg-[#00bcd4] w-full'
                                    : 'w-0'
                            }`}
                        ></div>
                    </div>

                    <div className="flex flex-col items-center relative z-10 w-40">
                        <div
                            className={`w-14 h-14 rounded-[20px] flex items-center justify-center text-xl font-bold bg-white shadow-sm border-2 transition-all duration-500 ${
                                loadingStep >= 2
                                    ? 'border-[#00bcd4] text-[#00bcd4]'
                                    : 'border-slate-100 text-slate-300'
                            }`}
                        >
                            2
                        </div>
                        <span
                            className={`mt-4 text-sm font-bold transition-all duration-500 ${
                                loadingStep >= 2
                                    ? 'text-[#1e293b]'
                                    : 'text-slate-500'
                            }`}
                        >
                            อ่านไฟล์
                        </span>
                    </div>

                    <div className="flex-1 h-[2px] -ml-8 -mr-8 -mt-10 relative z-0 bg-slate-200">
                        <div
                            className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ${
                                loadingStep >= 3
                                    ? 'bg-[#00bcd4] w-full'
                                    : 'w-0'
                            }`}
                        ></div>
                    </div>

                    <div className="flex flex-col items-center relative z-10 w-40">
                        <div
                            className={`w-14 h-14 rounded-[20px] flex items-center justify-center text-xl font-bold bg-white shadow-sm border-2 transition-all duration-500 ${
                                loadingStep >= 3
                                    ? 'border-[#00bcd4] text-[#00bcd4]'
                                    : 'border-slate-100 text-slate-300'
                            }`}
                        >
                            3
                        </div>
                        <span
                            className={`mt-4 text-sm font-bold transition-all duration-500 ${
                                loadingStep >= 3
                                    ? 'text-[#1e293b]'
                                    : 'text-slate-500'
                            }`}
                        >
                            ตรวจสอบ
                        </span>
                    </div>
                </div>

                <div className="flex flex-col items-center w-full max-w-2xl relative">
                    <div className="relative w-24 h-24 mb-6">
                        <svg
                            className="w-full h-full -rotate-90"
                            viewBox="0 0 100 100"
                        >
                            <circle
                                cx="50"
                                cy="50"
                                r="46"
                                fill="transparent"
                                className="stroke-slate-200"
                                strokeWidth="4"
                            ></circle>
                            <circle
                                cx="50"
                                cy="50"
                                r="46"
                                fill="transparent"
                                strokeDasharray="289.026"
                                strokeDashoffset={
                                    289.026 * (1 - loadingProgress / 100)
                                }
                                className="stroke-[#00bcd4] transition-all duration-300"
                                strokeWidth="4"
                                strokeLinecap="round"
                            ></circle>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[#00bcd4] font-black text-sm">
                                {loadingProgress}%
                            </span>
                        </div>
                    </div>

                    <h3 className="text-3xl font-black text-[#1e293b] tracking-tight mb-2">
                        {loadingStep === 1
                            ? 'กำลังอัปโหลดไฟล์...'
                            : loadingStep === 2
                            ? 'กำลังอ่านไฟล์ด้วย AI...'
                            : loadingStep === 3
                            ? 'กำลังตรวจสอบความถูกต้อง...'
                            : 'สแกนไฟล์สำเร็จ !'}
                    </h3>
                    <p className="text-slate-400 text-sm font-medium">
                        {loadingStep === 4
                            ? 'ระบบกำลังเตรียมข้อมูลและพาคุณไปหน้าผลลัพธ์...'
                            : 'กำลังวิเคราะห์เอกสาร...'}
                    </p>

                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="mt-6 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold border border-red-700 transition-colors"
                            title="ยกเลิกการอัปโหลด"
                        >
                            {cancelLabel}
                        </button>
                    )}

                </div>
            </div>
        </div>
    );
};

export default LoadingOverlay;

