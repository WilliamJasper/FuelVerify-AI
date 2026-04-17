import React from 'react';
import { Upload, FileText, AlertCircle, Search, Plus } from 'lucide-react';

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
    onClear,
    bank = 'kbank'
}) => {
    const isBBL = bank === 'bbl';
    const primaryColor = isBBL ? 'blue' : 'emerald';
    const primaryHex = isBBL ? '#003399' : '#00A950';
    const bankName = isBBL ? 'BBL' : 'KBank';
    
    // Animation class based on bank
    const animClass = isBBL ? 'bbl-fade-in-delay-3' : 'kbank-fade-in-delay-3';

    return (
        <div className={`w-full max-w-2xl space-y-6 ${animClass}`}>
            {/* Top Card: Drop Zone */}
            <div className="bg-white rounded-[32px] shadow-xl shadow-slate-200/50 p-6 md:p-8">
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
                    className={`rounded-3xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-all duration-300 ${
                        isDragActive
                            ? `border-${primaryColor}-500 bg-${primaryColor}-50/50`
                            : `border-slate-100 bg-slate-50/50 hover:border-${primaryColor}-300 hover:bg-white`
                    }`}
                >
                    <div className="flex justify-center mb-6">
                        <div className={`w-20 h-20 rounded-3xl bg-${primaryColor}-50 flex items-center justify-center`}>
                            <Upload className={`w-10 h-10 text-${primaryColor}-500 opacity-80`} />
                        </div>
                    </div>
                    <p className="text-slate-900 font-bold text-xl mb-2">
                        ลากไฟล์มาวาง หรือ <span className={`text-${primaryColor}-600 underline`}>คลิกเพื่อเลือกไฟล์</span>
                    </p>
                    <p className="text-slate-400 text-sm font-medium">
                        รองรับไฟล์ PDF (ขนาดไม่เกิน 20MB)
                    </p>
                </div>

                {file && (
                   <div className="mt-6 space-y-2">
                        {/* Display single file or list of files */}
                        {(Array.isArray(file) ? file : [file]).filter(Boolean).map((f, index) => (
                            <div key={index} className={`flex items-center gap-4 rounded-2xl border border-${primaryColor}-100 bg-${primaryColor}-50/30 p-4 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                <div className={`w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm`}>
                                    <FileText className={`w-6 h-6 text-${primaryColor}-600`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-slate-800 truncate">
                                        {f.name}
                                    </p>
                                    <p className="text-xs text-slate-400 font-medium">
                                        {(f.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if (Array.isArray(file)) {
                                            // Handled by parent through onClear(index) if we want specific removal, 
                                            // but for now onClear usually clears all.
                                            // Let's make it clear all for simplicity or pass index.
                                            onClear(index); 
                                        } else {
                                            onClear();
                                        }
                                    }}
                                    className="text-slate-300 hover:text-rose-500 transition-colors bg-white w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
                                >
                                    <Plus className="rotate-45 w-5 h-5" />
                                </button>
                            </div>
                        ))}
                   </div>
                )}

                {error && (
                    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50/50 px-4 py-3 text-rose-800">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0 text-sm font-medium">
                            {error}
                        </div>
                        <button
                            type="button"
                            onClick={onErrorClear}
                            className="text-xs font-bold text-rose-700 underline shrink-0 hover:no-underline"
                        >
                            ปิด
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Card: Action Button */}
            <div className="bg-white rounded-[24px] shadow-xl shadow-slate-200/50 p-4">
                <button
                    type="button"
                    onClick={onUpload}
                    disabled={!file || loading}
                    style={{ backgroundColor: file && !loading ? primaryHex : '#F1F5F9' }}
                    className={`w-full py-5 rounded-2xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg ${
                        file && !loading 
                            ? 'text-white shadow-primary/20 hover:brightness-110' 
                            : 'text-slate-400 shadow-none cursor-not-allowed'
                    }`}
                >
                    <Search className={`${file && !loading ? 'text-white' : 'text-slate-300'}`} size={22} />
                    <span className="text-lg">เริ่มสแกนเอกสาร</span>
                </button>
            </div>
        </div>
    );
};

export default UploadStatement;
