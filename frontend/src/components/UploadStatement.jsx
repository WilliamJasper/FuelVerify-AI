import React from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';

const UploadStatement = ({
    file,
    loading,
    error,
    isDragActive,
    fileInputRef,
    onFileChange,
    onDrop,
    onDragOver,
    onDragLeave,
    triggerInput,
    onUpload,
    onErrorClear,
}) => {
    return (
        <div className="w-full max-w-3xl kbank-fade-in-delay-3">
            <div className="bg-gradient-to-r from-emerald-200 via-[#86EFAC] to-sky-200 p-[1px] rounded-[28px] shadow-lg">
                <div className="bg-white rounded-[27px] p-8 md:p-10">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={onFileChange}
                    />

                    <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                triggerInput();
                            }
                        }}
                        onClick={triggerInput}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        className={`rounded-2xl border-2 border-dashed px-6 py-14 text-center cursor-pointer transition-colors ${
                            isDragActive
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-slate-200 bg-slate-50/80 hover:border-emerald-400 hover:bg-emerald-50/50'
                        }`}
                    >
                        <div className="flex justify-center mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                                <Upload className="w-7 h-7 text-emerald-600" />
                            </div>
                        </div>
                        <p className="text-slate-800 font-semibold text-lg mb-1">
                            ลากไฟล์ PDF มาวาง หรือคลิกเลือกไฟล์
                        </p>
                        <p className="text-slate-500 text-sm">
                            รองรับใบแจ้งยอด KBank (PDF) เท่านั้น
                        </p>
                    </div>

                    {file && (
                        <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-800 truncate">
                                    {file.name}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0 text-sm">
                                <p className="font-medium">ไม่สามารถประมวลผลได้</p>
                                <p className="mt-1 text-red-700/90 break-words">{error}</p>
                            </div>
                            <button
                                type="button"
                                onClick={onErrorClear}
                                className="text-xs font-medium text-red-700 underline shrink-0"
                            >
                                ปิด
                            </button>
                        </div>
                    )}

                    <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            type="button"
                            onClick={triggerInput}
                            disabled={loading}
                            className="px-6 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50"
                        >
                            เลือกไฟล์
                        </button>
                        <button
                            type="button"
                            onClick={onUpload}
                            disabled={!file || loading}
                            className="px-8 py-3 rounded-xl bg-[#00A950] text-white font-semibold shadow-md hover:bg-[#008f45] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            เริ่มอ่านใบแจ้งยอด
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UploadStatement;
