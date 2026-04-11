import React, { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uploadStatement } from '../services/api.js';
import { updateRecordStatement } from '../utils/records.js';
import LoadingOverlay from '../components/LoadingOverlay.jsx';
import UploadStatement from '../components/UploadStatement.jsx';
import UploadStatementHeader from '../components/UploadStatementHeader.jsx';

const runFakeProgress = (
    setLoadingStep,
    setLoadingProgress,
    isCancelledRef,
) => {
    setLoadingStep(1);
    return (async () => {
        for (let i = 1; i <= 20; i++) {
            if (isCancelledRef.current) return;
            await new Promise((r) => setTimeout(r, 100));
            if (isCancelledRef.current) return;
            setLoadingProgress(Math.floor((i / 20) * 33));
        }
        if (isCancelledRef.current) return;
        setLoadingStep(2);
        for (let i = 1; i <= 20; i++) {
            if (isCancelledRef.current) return;
            await new Promise((r) => setTimeout(r, 100));
            if (isCancelledRef.current) return;
            setLoadingProgress(Math.floor(33 + (i / 20) * 33));
        }
        if (isCancelledRef.current) return;
        setLoadingStep(3);
        for (let i = 1; i <= 20; i++) {
            if (isCancelledRef.current) return;
            await new Promise((r) => setTimeout(r, 100));
            if (isCancelledRef.current) return;
            setLoadingProgress(Math.floor(66 + (i / 20) * 33));
        }
    })();
};

const UploadStatementPageBBL = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingStep, setLoadingStep] = useState(1);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const abortControllerRef = useRef(null);
    const isCancelledRef = useRef(false);
    const navigateTimeoutRef = useRef(null);

    const handleFileChange = (e) => {
        if (e.target.files?.length > 0) {
            const incoming = Array.from(e.target.files);
            setFile((prev) => {
                const existing = Array.isArray(prev) ? prev : prev ? [prev] : [];
                return [...existing, ...incoming];
            });
            setError(null);
        }
    };

    const handleClearFile = (index) => {
        if (index !== undefined && Array.isArray(file)) {
            const next = file.filter((_, i) => i !== index);
            setFile(next.length > 0 ? next : null);
        } else {
            setFile(null);
        }
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleUpload = async () => {
        if (!file || (Array.isArray(file) && file.length === 0) || !id) return;
        
        setLoading(true);
        setLoadingProgress(0);
        setLoadingStep(1);
        setError(null);
        isCancelledRef.current = false;

        try {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            // Run progress concurrently but simpler
            const progressPromise = runFakeProgress(
                setLoadingStep,
                setLoadingProgress,
                isCancelledRef,
            );

            const result = await uploadStatement(file, abortControllerRef.current.signal);
            
            if (isCancelledRef.current) return;
            
            await updateRecordStatement(id, result);
            
            // Ensure progress finishes or jumps to end
            setLoadingProgress(100);
            setLoadingStep(4);
            
            navigateTimeoutRef.current = setTimeout(() => {
                setLoading(false);
                navigate(`/dashboard/bbl/${id}`);
            }, 800);
        } catch (err) {
            console.error("Upload error:", err);
            if (!isCancelledRef.current) {
                setError(
                    err.response?.data?.detail ||
                        'เกิดข้อผิดพลาดในการประมวลผลไฟล์ กรุณาลองใหม่อีกครั้ง',
                );
            }
            setLoading(false);
        }
    };

    const handleCancelUpload = () => {
        if (!loading) return;
        isCancelledRef.current = true;
        try {
            abortControllerRef.current?.abort();
        } catch (_) {}
        if (navigateTimeoutRef.current) {
            clearTimeout(navigateTimeoutRef.current);
            navigateTimeoutRef.current = null;
        }
        setLoading(false);
        setLoadingProgress(0);
        setLoadingStep(1);
        setError(null);
    };

    const triggerFileInput = () => fileInputRef.current?.click();

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        if (e.dataTransfer?.files?.length > 0) {
            const incoming = Array.from(e.dataTransfer.files);
            setFile((prev) => {
                const existing = Array.isArray(prev) ? prev : prev ? [prev] : [];
                return [...existing, ...incoming];
            });
            setError(null);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
    };

    return (
        <div className="min-h-screen ocean-bg text-slate-900 font-sans pb-20">
            <LoadingOverlay
                loading={loading}
                loadingProgress={loadingProgress}
                loadingStep={loadingStep}
                onCancel={handleCancelUpload}
            />

            <UploadStatementHeader bank="bbl" />

            <main
                className={`max-w-[1400px] mx-auto px-6 md:px-10 py-16 flex flex-col items-center transition-all duration-1000 ease-in-out ${
                    loading ? 'opacity-0 scale-95 pointer-events-none translate-y-10' : 'opacity-100 scale-100 translate-y-0'
                }`}
            >
                <div className="flex items-center gap-3 mb-8 text-blue-700 bbl-fade-in bg-white/50 px-4 py-2 rounded-full border border-blue-100/50 backdrop-blur-sm shadow-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.5)]"></span>
                    <span className="text-sm font-bold tracking-wide uppercase">
                        BBL Intelligent OCR System Active
                    </span>
                </div>

                <div className="text-center mb-12 bbl-fade-in-delay-1 max-w-3xl">
                    <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 text-slate-900 leading-tight">
                        อัปโหลดใบแจ้งยอด <br/>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#003399] to-[#2563EB]">BBL Statement</span>
                    </h1>
                    <p className="text-slate-600 text-lg md:text-xl font-medium leading-relaxed">
                        ระบบอัจฉริยะช่วยตรวจสอบรายการจากใบแจ้งยอดธนาคารกรุงเทพ <br className="hidden md:block"/> 
                        จัดการข้อมูลบัตรเครดิตให้เป็นเรื่องง่ายและรวดเร็ว
                    </p>
                </div>

                <div className="flex flex-wrap justify-center gap-3 mb-16 bbl-fade-in-delay-2">
                    <div className="px-5 py-2 bg-white/80 text-blue-800 rounded-2xl text-sm font-bold border border-blue-100 shadow-sm hover-lift">
                        <span className="text-blue-500 mr-2">✓</span> BBL PDF Verified
                    </div>
                    <div className="px-5 py-2 bg-white/80 text-indigo-800 rounded-2xl text-sm font-bold border border-indigo-100 shadow-sm hover-lift">
                        <span className="text-indigo-500 mr-2">✓</span> Smart Parsing
                    </div>
                    <div className="px-5 py-2 bg-white/80 text-cyan-800 rounded-2xl text-sm font-bold border border-cyan-100 shadow-sm hover-lift">
                        <span className="text-cyan-500 mr-2">✓</span> Expense Summary
                    </div>
                </div>

                <UploadStatement
                    file={file}
                    loading={loading}
                    error={error}
                    isDragActive={isDragActive}
                    fileInputRef={fileInputRef}
                    onFileChange={handleFileChange}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    triggerInput={triggerFileInput}
                    onUpload={handleUpload}
                    onErrorClear={() => setError(null)}
                    onClear={handleClearFile}
                    bank="bbl"
                />
            </main>
        </div>
    );
};

export default UploadStatementPageBBL;
