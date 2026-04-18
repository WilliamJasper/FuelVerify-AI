import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ZoomIn, ZoomOut, RotateCcw, FileText, Download, Printer } from 'lucide-react';

const TaxInvoicePage = () => {
    const { recordId, pageIndex } = useParams();
    const navigate = useNavigate();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [zoom, setZoom] = useState(0.8);

    useEffect(() => {
        const fetchInvoiceData = async () => {
            try {
                const res = await fetch(`http://127.0.0.1:5004/api/invoices/${recordId}/${pageIndex}/data`);
                if (res.ok) {
                    const data = await res.json();
                    setInvoice(data);
                } else {
                    console.error('Failed to fetch invoice');
                }
            } catch (err) {
                console.error('Error fetching invoice:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchInvoiceData();
    }, [recordId, pageIndex]);

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head><title>Print Tax Invoice</title></head>
                <body style="margin:0; display:flex; justify-content:center; align-items:center;">
                    <img src="${invoice.data}" style="max-width:100%; height:auto;" />
                </body>
                <script>
                    window.onload = function() {
                        window.print();
                        window.onafterprint = function() { window.close(); };
                    }
                </script>
            </html>
        `);
        printWindow.document.close();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-600 font-bold">กำลังโหลดใบกำกับภาษี...</p>
                </div>
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6">
                <div className="p-6 bg-white rounded-3xl shadow-xl text-center">
                    <FileText size={64} className="mx-auto text-slate-300 mb-4" />
                    <h2 className="text-2xl font-black text-slate-800">ไม่พบข้อมูลใบกำกับภาษี</h2>
                    <p className="text-slate-500 mt-2">ไฟล์อาจถูกลบหรือไม่มีอยู่ในระบบ</p>
                </div>
                <button 
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-2xl hover:bg-slate-700 transition-all font-bold"
                >
                    <ArrowLeft size={20} /> กลับไปหน้าก่อนหน้า
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
            {/* Header Toolbar */}
            <div className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-50 shadow-sm">
                <div className="flex items-center gap-6">
                    <button 
                        onClick={() => navigate(-1)}
                        className="p-3 rounded-2xl bg-slate-50 text-slate-600 hover:bg-white hover:text-blue-600 transition-all border border-slate-100 shadow-sm group"
                        title="กลับ"
                    >
                        <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <FileText className="text-blue-600" />
                            ใบกำกับภาษี: {invoice.filename}
                        </h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-0.5">
                            Record ID: {recordId} | หน้า: {parseInt(pageIndex) + 1}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 mr-4">
                        <button 
                            onClick={() => setZoom(prev => Math.max(0.2, prev - 0.1))}
                            className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-blue-600 transition-all active:scale-90"
                            title="Zoom Out"
                        >
                            <ZoomOut size={20} />
                        </button>
                        <span className="text-slate-800 font-black text-sm min-w-[60px] text-center">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button 
                            onClick={() => setZoom(prev => Math.min(3, prev + 0.1))}
                            className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-blue-600 transition-all active:scale-90"
                            title="Zoom In"
                        >
                            <ZoomIn size={20} />
                        </button>
                        <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
                        <button 
                            onClick={() => setZoom(0.8)}
                            className="p-2 rounded-xl hover:bg-white text-slate-600 transition-all"
                            title="Reset"
                        >
                            <RotateCcw size={18} />
                        </button>
                    </div>

                    <button 
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <Printer size={20} /> พิมพ์
                    </button>
                    
                    <a 
                        href={invoice.data} 
                        download={invoice.filename}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                        <Download size={20} /> ดาวน์โหลด
                    </a>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-12 flex items-start justify-center custom-scrollbar">
                <div 
                    className="bg-white p-4 rounded-lg shadow-2xl transition-transform duration-200 origin-top"
                    style={{ transform: `scale(${zoom})` }}
                >
                    <img 
                        src={invoice.data} 
                        alt="Tax Invoice" 
                        className="max-w-none rounded-sm"
                    />
                </div>
            </div>
        </div>
    );
};

export default TaxInvoicePage;
