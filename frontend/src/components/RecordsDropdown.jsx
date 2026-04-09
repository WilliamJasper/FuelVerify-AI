import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Eye, Trash2 } from 'lucide-react';
import { deleteRecord, listRecords } from '../utils/records.js';

const formatDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}/${m}/${y}`;
};

const formatTime = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const RecordsDropdown = ({ label = 'KBank Statement OCR', variant = 'dark' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const [records, setRecords] = useState([]);
    const isNewRecord = (createdAt) => {
        const t = new Date(createdAt).getTime();
        if (!Number.isFinite(t)) return false;
        // "เพิ่งถูกสร้างขึ้นมา" = ภายใน 10 นาทีล่าสุด
        return Date.now() - t <= 10 * 60 * 1000;
    };

    const refresh = async () => {
        const data = await listRecords();
        setRecords(data);
    };

    useEffect(() => {
        if (open) {
            refresh();
        }
    }, [open]);

    const activeId = useMemo(() => {
        const path = location?.pathname || '';
        const m = path.match(/^\/dashboard\/([^\/?#]+)/);
        return m ? m[1] : null;
    }, [location?.pathname]);

    useEffect(() => {
        const onDoc = (e) => {
            if (!open) return;
            const el = e.target;
            if (el?.closest?.('[data-records-dropdown]')) return;
            setOpen(false);
        };
        document.addEventListener('click', onDoc);
        return () => document.removeEventListener('click', onDoc);
    }, [open]);

    const rows = useMemo(() => Array.isArray(records) ? records.slice(0, 20) : [], [records]);

    const go = (id) => {
        setOpen(false);
        navigate(`/dashboard/${id}`);
    };

    const del = async (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm('ลบรายการนี้?')) return;
        await deleteRecord(id);
        setOpen(false);
        navigate('/', { replace: true });
    };

    return (
        <div className="relative" data-records-dropdown>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={
                    variant === 'light'
                        ? 'flex items-center gap-2 p-3 bg-slate-100 hover:bg-blue-50 rounded-xl transition-all border border-slate-200 hover:border-blue-200 text-slate-700'
                        : 'flex items-center gap-2 bg-[#2A314C] text-slate-300 px-4 py-2 rounded-lg cursor-pointer hover:bg-[#343B5C] transition-colors border border-slate-600/50'
                }
            >
                <span className="font-medium text-sm">{label}</span>
                <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                        open ? 'rotate-180' : ''
                    }`}
                />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-[720px] max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div>
                            <p className="text-slate-800 font-bold">รายการ</p>
                            <p className="text-slate-500 text-xs">
                                แสดงสูงสุด 20 รายการล่าสุด
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                deleteRecord('__noop__');
                                refresh();
                            }}
                            className="hidden"
                        >
                            noop
                        </button>
                    </div>

                    {rows.length === 0 ? (
                        <div className="p-6 text-slate-500 text-sm">
                            ยังไม่มีรายการ (อัปโหลด statement ก่อน)
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-white border-b border-slate-200">
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                            ชื่อไฟล์
                                        </th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-40">
                                            วันที่สร้าง
                                        </th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-28">
                                            เวลา
                                        </th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-24 text-right">
                                            จัดการ
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.map((r) => {
                                        const isActive = !!activeId && String(r.id) === String(activeId);
                                        return (
                                            <tr
                                                key={r.id}
                                                onClick={() => go(r.id)}
                                                className={`cursor-pointer transition-colors duration-150 ${
                                                    isActive
                                                        ? 'bg-blue-50/70 hover:bg-blue-50'
                                                        : 'hover:bg-slate-50 active:bg-blue-50'
                                                }`}
                                            >
                                            <td className="px-5 py-4 font-medium text-slate-800">
                                                <div className="flex items-center gap-3">
                                                    <span className="truncate max-w-[220px]">{r.filename || '—'}</span>
                                                    {isNewRecord(r.createdAt) && (
                                                        <span className="text-[11px] font-bold text-white bg-red-600 border border-red-700 px-2 py-0.5 rounded-full">
                                                            New
                                                        </span>
                                                    )}
                                                    {isActive && (
                                                        <span className="text-[11px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                                                            กำลังดู
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-slate-600">
                                                {formatDate(r.createdAt)}
                                            </td>
                                            <td className="px-5 py-4 text-slate-600">
                                                {formatTime(r.createdAt)}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            go(r.id);
                                                        }}
                                                        className={`p-2 rounded-lg hover:bg-blue-50 text-blue-600 ${
                                                            isActive ? 'opacity-60 cursor-default' : ''
                                                        }`}
                                                        title="ดู"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => del(e, r.id)}
                                                        className="p-2 rounded-lg hover:bg-red-50 text-red-600"
                                                        title="ลบ"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RecordsDropdown;
