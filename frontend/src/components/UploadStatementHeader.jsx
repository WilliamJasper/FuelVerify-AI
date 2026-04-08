import React from 'react';
import { FileText } from 'lucide-react';
import RecordsDropdown from './RecordsDropdown.jsx';

export default function UploadStatementHeader() {
  return (
    <nav className="w-full bg-[#1E243B] px-8 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-[#8B5CF6] rounded-xl flex items-center justify-center shadow-lg">
          <FileText className="text-white w-5 h-5" />
        </div>
        <h1 className="text-white font-bold text-xl tracking-wide">FuelVerify AI</h1>
      </div>
      <div className="flex items-center gap-3">
        <RecordsDropdown label="รายการ" />
        <div className="bg-[#2A314C] text-slate-300 px-4 py-2 rounded-lg text-sm border border-slate-600/50">
          KBank Statement OCR
        </div>
      </div>
    </nav>
  );
}

