import React from 'react';
import { FileText, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import RecordsDropdown from './RecordsDropdown.jsx';

export default function UploadStatementHeader() {
  const navigate = useNavigate();
  return (
    <nav className="w-full bg-[#1E243B] px-8 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-4">
        <div onClick={() => navigate('/')} className="cursor-pointer w-10 h-10 bg-[#8B5CF6] rounded-xl flex items-center justify-center shadow-lg">
          <FileText className="text-white w-5 h-5" />
        </div>
        <h1 onClick={() => navigate('/')} className="cursor-pointer text-white font-bold text-xl tracking-wide">FuelVerify AI</h1>
      </div>
      <div className="flex items-center gap-3">
        <RecordsDropdown label="รายการ" />
        <button
          onClick={() => navigate('/')}
          className="group p-2.5 flex items-center justify-center bg-[#2A314C] hover:bg-[#343B5C] text-slate-300 rounded-xl border border-slate-600/50 transition-colors active:scale-95"
          title="กลับหน้ารายการ"
        >
          <Plus size={18} className="group-hover:rotate-90 transition-transform" />
        </button>
        <div className="bg-[#2A314C] text-slate-300 px-5 py-2.5 rounded-xl text-sm border border-slate-600/50 uppercase tracking-wider font-bold">
          KBank Statement OCR
        </div>
      </div>
    </nav>
  );
}

