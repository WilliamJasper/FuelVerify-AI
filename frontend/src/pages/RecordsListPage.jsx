import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Pencil, 
  Eye, 
  Trash2, 
  Search,
  MoreVertical,
  Calendar,
  Clock,
  ChevronRight,
  FileText,
  X
} from 'lucide-react';
import { listRecords, createRecordManual, deleteRecord, updateRecordName, updateRecordStatement } from '../utils/records.js';
import Header from '../components/Header.jsx';

const RecordsListPage = () => {
    const navigate = useNavigate();
    const [records, setRecords] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentRecord, setCurrentRecord] = useState(null);
    const [newRecordName, setNewRecordName] = useState('');

    const [isLoading, setIsLoading] = useState(true);

    const [newBank, setNewBank] = useState('KBANK');
    const [newComp, setNewComp] = useState('บจก. เอกสหกรุ๊ป');
    const [newMonth, setNewMonth] = useState('มกราคม');
    const [newYear, setNewYear] = useState(new Date().getFullYear() + 543);

    const companies = {
        'KBANK': [
            'บจก. เอกสหกรุ๊ป',
            'บจก.เอกสหกรุ๊ป มอเตอร์',
            'บจก.เอกสหกรุ๊ป ออโตโมบิล',
            'บจก.เอกสห เอ มอเตอร์'
        ],
        'BBL': [
            'บจก. เอกสห จี มอเตอร์'
        ]
    };

    const months = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    useEffect(() => {
        loadRecords();
    }, []);

    const loadRecords = async () => {
        setIsLoading(true);
        const data = await listRecords();
        setRecords(data);
        setIsLoading(false);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        const combinedName = `${newBank} - ${newComp} (${newMonth} ${newYear})`;
        if (!combinedName.trim()) return;
        setIsLoading(true);
        const newRecord = await createRecordManual(combinedName);
        if (newRecord) {
            setIsCreateModalOpen(false);
            await loadRecords();
        }
        setIsLoading(false);
    };

    const handleUpdateRecord = async (e) => {
        e.preventDefault();
        const combinedName = `${newBank} - ${newComp} (${newMonth} ${newYear})`;
        if (!combinedName.trim() || !currentRecord) return;
        setIsLoading(true);
        await updateRecordName(currentRecord.id, combinedName.trim());
        setCurrentRecord(null);
        setIsEditModalOpen(false);
        await loadRecords();
    };

    const handleDeleteRecord = async (id) => {
        if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?')) {
            setIsLoading(true);
            await deleteRecord(id);
            await loadRecords();
        }
    };

    const openEditModal = (record) => {
        setCurrentRecord(record);
        setIsEditModalOpen(true);
    };

    const filteredRecords = records.filter(r => 
        r.filename.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('th-TH', { 
            day: '2-digit', 
            month: '2-digit', 
            year: '2-digit' 
        });
    };

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('th-TH', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };

    const isRecentlyCreated = (createdAt) => {
        const created = new Date(createdAt).getTime();
        const now = new Date().getTime();
        return (now - created) < 60000; // 1 minute
    };

    const parseName = (name) => {
        try {
            // "KBANK - บจก. เอกสหกรุ๊ป (มกราคม 2567)"
            const [bank, rest] = name.split(' - ');
            if (!rest) return { bank: name, comp: '-', month: '-', year: '-' };
            const m = rest.match(/^(.*?) \((.*?)\)$/);
            if (!m) return { bank, comp: rest, month: '-', year: '-' };
            const [month, year] = m[2].split(' ');
            return { bank, comp: m[1], month, year };
        } catch (e) {
            return { bank: name, comp: '-', month: '-', year: '-' };
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-20">
            <Header />

            <main className="max-w-[1200px] mx-auto px-6 py-10 page-transition">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">รายการทั้งหมด</h1>
                        <p className="text-slate-500">จัดการข้อมูลรายการและการตรวจสอบสลิปของคุณ</p>
                    </div>
                    
                    <button 
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all active:scale-95"
                    >
                        <Plus size={20} />
                        สร้างรายการใหม่
                    </button>
                </div>

                {/* Search Bar */}
                <div className="relative mb-8">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                        <Search size={20} />
                    </div>
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อรายการ..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all shadow-sm"
                    />
                </div>

                {/* Records Table */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-bottom border-slate-100">
                                    <th className="px-4 py-5 text-sm font-semibold text-slate-600">ธนาคาร</th>
                                    <th className="px-4 py-5 text-sm font-semibold text-slate-600">ชื่อบริษัท</th>
                                    <th className="px-4 py-5 text-sm font-semibold text-slate-600 text-center">เดือน</th>
                                    <th className="px-4 py-5 text-sm font-semibold text-slate-600 text-center">ปี (พ.ศ.)</th>
                                    <th className="px-4 py-5 text-sm font-semibold text-slate-600 text-center">ใบแจ้งยอด</th>
                                    <th className="px-4 py-5 text-sm font-semibold text-slate-600 text-center">วันที่สร้าง</th>
                                    <th className="px-4 py-5 text-sm font-semibold text-slate-600 text-center">เวลา</th>
                                    <th className="px-4 py-5 text-sm font-semibold text-slate-600 text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredRecords.length > 0 ? (
                                    filteredRecords.map((record) => (
                                        <tr key={record.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-4 py-5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                                        record.filename.startsWith('KBANK') ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {parseName(record.filename).bank}
                                                    </span>
                                                    {(record.isNew || isRecentlyCreated(record.createdAt)) && (
                                                        <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-bold rounded-full border border-rose-200 uppercase tracking-wider animate-pulse">
                                                            New
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-5 font-medium text-slate-700">
                                                {parseName(record.filename).comp}
                                            </td>
                                            <td className="px-4 py-5 text-center font-semibold text-slate-600">
                                                {parseName(record.filename).month}
                                            </td>
                                            <td className="px-4 py-5 text-center font-bold text-slate-900">
                                                {parseName(record.filename).year}
                                            </td>
                                             <td className="px-4 py-5 text-center">
                                                 {record.result ? (
                                                     <div className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100 text-xs font-semibold max-w-[140px] mx-auto group/file relative">
                                                         <FileText size={14} className="shrink-0" />
                                                         <span className="truncate" title={record.result.filename || 'Statement'}>
                                                             {record.result.filename || 'Statement'}
                                                         </span>
                                                         <button
                                                             onClick={async (e) => {
                                                                 e.stopPropagation();
                                                                 if (window.confirm('ลบใบแจ้งยอดนี้ออกจากรายการหรือไม่?')) {
                                                                     setIsLoading(true);
                                                                     await updateRecordStatement(record.id, null);
                                                                     await loadRecords();
                                                                 }
                                                             }}
                                                             className="absolute -right-1.5 -top-1.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg transform scale-0 group-hover/file:scale-100 transition-transform hover:bg-rose-600 active:scale-90"
                                                             title="ลบใบแจ้งยอด"
                                                         >
                                                             <X size={12} />
                                                         </button>
                                                     </div>
                                                 ) : (
                                                     <button
                                                         onClick={() => navigate(`/upload/${record.id}`)}
                                                         className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all active:scale-90"
                                                         title="อัปโหลดใบแจ้งยอด"
                                                     >
                                                         <FileText size={20} />
                                                     </button>
                                                 )}
                                             </td>
                                            <td className="px-4 py-5 text-center">
                                                <span className="text-slate-600 text-sm">{formatDate(record.createdAt)}</span>
                                            </td>
                                            <td className="px-4 py-5 text-center">
                                                <div className="flex items-center justify-center gap-1.5 text-slate-600 text-sm">
                                                    <Clock size={14} className="text-slate-400" />
                                                    {formatTime(record.createdAt)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-5">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button 
                                                        onClick={() => openEditModal(record)}
                                                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all active:scale-90"
                                                        title="แก้ไข"
                                                    >
                                                        <Pencil size={18} />
                                                    </button>
                                                    <button 
                                                        onClick={() => navigate(`/dashboard/${record.id}`)}
                                                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all active:scale-90"
                                                        title="ดูรายละเอียด"
                                                    >
                                                        <Eye size={18} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteRecord(record.id)}
                                                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-all active:scale-90"
                                                        title="ลบ"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                                                    <Search size={32} />
                                                </div>
                                                <div className="text-slate-400">
                                                    {searchTerm ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายการข้อมูลในขณะนี้'}
                                                </div>
                                                <button 
                                                    onClick={() => setIsCreateModalOpen(true)}
                                                    className="text-blue-600 font-semibold hover:underline"
                                                >
                                                    สร้างรายการแรกของคุณ
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <h2 className="text-2xl font-bold text-slate-900 mb-6">สร้างรายการใหม่</h2>
                        <form onSubmit={handleCreate}>
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">ธนาคาร</label>
                                    <select value={newBank} onChange={(e) => { const b = e.target.value; setNewBank(b); setNewComp(companies[b][0]); }} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                                        <option value="KBANK">กสิกร (KBANK)</option>
                                        <option value="BBL">กรุงเทพ (BBL)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อบริษัท</label>
                                    <select value={newComp} onChange={(e) => setNewComp(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                                        {companies[newBank].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">เดือน</label>
                                        <select value={newMonth} onChange={(e) => setNewMonth(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                                            {months.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">ปี (พ.ศ.)</label>
                                        <input type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-4 px-4 rounded-xl font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-4 px-4 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all">บันทึก</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <h2 className="text-2xl font-bold text-slate-900 mb-6">แก้ไขชื่อรายการ</h2>
                        <form onSubmit={handleUpdateRecord}>
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">ธนาคาร</label>
                                    <select value={newBank} onChange={(e) => { const b = e.target.value; setNewBank(b); setNewComp(companies[b][0]); }} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                                        <option value="KBANK">กสิกร (KBANK)</option>
                                        <option value="BBL">กรุงเทพ (BBL)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อบริษัท</label>
                                    <select value={newComp} onChange={(e) => setNewComp(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                                        {companies[newBank].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">เดือน</label>
                                        <select value={newMonth} onChange={(e) => setNewMonth(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                                            {months.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">ปี (พ.ศ.)</label>
                                        <input type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 py-4 px-4 rounded-xl font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-4 px-4 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all">อัปเดต</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecordsListPage;
