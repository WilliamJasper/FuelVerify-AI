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

const UploadStatementPage = () => {
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
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!file || !id) return;
        setLoading(true);
        setLoadingProgress(0);
        setLoadingStep(1);
        setError(null);
        isCancelledRef.current = false;

        try {
            abortControllerRef.current?.abort();
            abortControllerRef.current = new AbortController();

            const apiCall = uploadStatement(file, abortControllerRef.current.signal).then(
                (data) => ({ data }),
            );
            const runProgress = runFakeProgress(
                setLoadingStep,
                setLoadingProgress,
                isCancelledRef,
            );
            const [response] = await Promise.all([apiCall, runProgress]);

            if (isCancelledRef.current) return;
            
            // รอให้บันทึกลง SQLite ก่อน
            await updateRecordStatement(id, response.data);
            
            setLoadingProgress(100);
            setLoadingStep(4);
            
            navigateTimeoutRef.current = setTimeout(() => {
                setLoading(false);
                navigate(`/dashboard/${id}`);
            }, 1000);
        } catch (err) {
            if (!isCancelledRef.current) {
                setError(
                    err.response?.data?.detail ||
                        'เกิดข้อผิดพลาดในการประมวลผลไฟล์',
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
            setFile(e.dataTransfer.files[0]);
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
        <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
            <LoadingOverlay
                loading={loading}
                loadingProgress={loadingProgress}
                loadingStep={loadingStep}
                onCancel={handleCancelUpload}
            />

            <UploadStatementHeader />

            <main
                className={`max-w-[1400px] mx-auto px-10 py-12 flex flex-col items-center transition-all duration-700 ease-in-out ${
                    loading ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
                }`}
            >
                <div className="flex items-center gap-2 mb-6 text-emerald-700 kbank-fade-in">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-base font-semibold text-slate-700">
                        พร้อมใช้งานผู้ช่วยอ่านใบแจ้งยอด KBank อัตโนมัติ
                    </span>
                </div>

                <div className="text-center mb-10 kbank-fade-in-delay-1">
                    <h1 className="text-5xl font-extrabold tracking-tight mb-4 text-slate-900 font-display">
                        อัปโหลดใบแจ้งยอด{' '}
                        <span className="text-[#00A950]">KBank Statement</span>
                    </h1>
                    <p className="text-slate-700 text-lg max-w-2xl mx-auto leading-relaxed">
                        เครื่องมือช่วยอ่านและสรุปรายการจากใบแจ้งยอดบัตรเครดิต/ฟลีทการ์ดกสิกรไทย
                        ลดเวลาคีย์มือ ช่วยตรวจสอบยอดและดอกเบี้ยให้ครบในที่เดียว
                    </p>
                </div>

                <div className="flex gap-3 mb-12 kbank-fade-in-delay-2">
                    <div className="px-4 py-1.5 bg-[#ECFDF3] text-[#15803D] rounded-full text-sm font-medium border border-[#BBF7D0]">
                        ● KBank PDF Statement
                    </div>
                    <div className="px-4 py-1.5 bg-[#E0F2FE] text-[#0369A1] rounded-full text-sm font-medium border border-[#BAE6FD]">
                        ● ตรวจยอด & ดอกเบี้ยอัตโนมัติ
                    </div>
                    <div className="px-4 py-1.5 bg-[#FEF3C7] text-[#B45309] rounded-full text-sm font-medium border border-[#FDE68A]">
                        ● รองรับส่งออกเพื่องานบัญชี
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
                />
            </main>
        </div>
    );
};

export default UploadStatementPage;
