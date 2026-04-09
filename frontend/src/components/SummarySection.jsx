import React, { useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Download, ChevronDown, FileCheck2, Receipt } from 'lucide-react';
import { buildCoverageSummary } from '../utils/matching.js';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';

function cardLabel(card) {
  return (
    card?.account_name ||
    card?.accountName ||
    (card?.card_no ? `**** ${String(card.card_no).replace(/\D/g, '').slice(-4)}` : '—')
  );
}

function extractBranch(desc) {
  const s = (desc ?? '').toString().trim();
  if (!s) return '—';
  const m = s.match(/([A-Z]{3,})\s*$/);
  if (m) return m[1];
  const parts = s.split(/\s+/);
  return parts[parts.length - 1] || '—';
}

function stripBranchFromDesc(desc) {
  const s = (desc ?? '').toString().trim();
  if (!s) return '—';
  // ถ้าคำท้ายสุดเป็นตัวพิมพ์ใหญ่ (เช่น NAKHONRATSIMA) ให้ตัดออกจาก "รายการ"
  const m = s.match(/^(.*?)(?:\s+([A-Z]{3,}))\s*$/);
  if (m && m[2]) {
    const head = (m[1] || '').trim();
    return head || s;
  }
  return s;
}

function vipNumberFromLabel(label) {
  const m = String(label || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}

export default function SummarySection({ result, slipResult }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(true);
  const [openMatchedByCard, setOpenMatchedByCard] = useState(true);
  const [openMissingByCard, setOpenMissingByCard] = useState(true);
  const summary = useMemo(
    () => {
      if (!result) return { matched: [], unmatched: [], matchedCount: 0, unmatchedCount: 0, totalTxns: 0 };
      return buildCoverageSummary(result, slipResult);
    },
    [result, slipResult],
  );

  const filteredUnmatched = useMemo(() => {
    if (!result) return [];
    const baseSorted = [...summary.unmatched].sort((a, b) => {
      const aVip = vipNumberFromLabel(cardLabel(a.card));
      const bVip = vipNumberFromLabel(cardLabel(b.card));
      if (aVip !== bVip) return aVip - bVip;
      return String(a.txn?.date || '').localeCompare(String(b.txn?.date || ''));
    });
    const q = query.trim().toLowerCase();
    if (!q) return baseSorted;
    return baseSorted.filter(({ txn, card }) => {
      const cardName = cardLabel(card).toLowerCase();
      const date = (txn?.date || '').toString().toLowerCase();
      const desc = (txn?.desc || '').toString().toLowerCase();
      const branch = extractBranch(txn?.desc).toLowerCase();
      return (
        cardName.includes(q) ||
        date.includes(q) ||
        desc.includes(q) ||
        branch.includes(q)
      );
    });
  }, [query, summary.unmatched]);

  const missingByCard = useMemo(() => {
    const counts = new Map();
    for (const { card } of summary.unmatched) {
      const label = cardLabel(card);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const rows = Array.from(counts.entries()).map(([label, count]) => ({
      label,
      count,
      vip: vipNumberFromLabel(label),
    }));
    rows.sort((a, b) => (a.vip - b.vip) || a.label.localeCompare(b.label));
    return rows;
  }, [summary.unmatched]);

  const matchedByCard = useMemo(() => {
    const counts = new Map();
    for (const { card } of summary.matched) {
      const label = cardLabel(card);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const rows = Array.from(counts.entries()).map(([label, count]) => ({
      label,
      count,
      vip: vipNumberFromLabel(label),
    }));
    rows.sort((a, b) => (a.vip - b.vip) || a.label.localeCompare(b.label));
    return rows;
  }, [summary.matched]);

  const focusCard = (label) => {
    const vip = vipNumberFromLabel(label);
    window.dispatchEvent(
      new CustomEvent('fuelverify:focus-card', { detail: { label, vip } }),
    );
  };

  const focusFirstMatchedTxn = (label) => {
    const vip = vipNumberFromLabel(label);
    const key = String(label || '').toLowerCase();
    const entry = summary.matched.find(({ card }) => String(cardLabel(card) || '').toLowerCase() === key);
    if (!entry?.card || !entry?.txn) return focusCard(label);

    const txns = Array.isArray(entry.card.transactions) ? entry.card.transactions : [];
    const idx = txns.findIndex(
      (t) =>
        (t?.date || '') === (entry.txn?.date || '') &&
        String(t?.amount || '') === String(entry.txn?.amount || '') &&
        String(t?.desc || '') === String(entry.txn?.desc || ''),
    );

    if (idx >= 0) {
      window.dispatchEvent(
        new CustomEvent('fuelverify:focus-txn', { detail: { label, vip, txnIndex: idx } }),
      );
    } else {
      focusCard(label);
    }
  };

  const exportUnmatchedExcel = () => {
    const header = ['ลำดับ', 'ชื่อบัตร', 'วันที่', 'รายการ', 'สาขา'];
    const rows = filteredUnmatched.map(({ txn, card }, idx) => ([
      idx + 1,
      cardLabel(card),
      txn?.date || '—',
      stripBranchFromDesc(txn?.desc),
      extractBranch(txn?.desc),
    ]));

    const wb = XLSX.utils.book_new();
    // สร้างเป็นตารางชัดเจน: header แถวแรก + data ต่อท้าย
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

    // เปิด filter ที่หัวตาราง
    ws['!autofilter'] = { ref: 'A1:E1' };

    // ให้คอลัมน์กว้างพออ่านง่าย (ตารางหลัก)
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 48 }, { wch: 20 }];

    // Style ให้เหมือน “ตาราง” แบบในตัวอย่าง (หัวฟ้า เส้นขอบทุกช่อง)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:E1');
    const border = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    };

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;

        const isHeader = r === 0;
        cell.s = {
          border,
          alignment: {
            vertical: 'center',
            horizontal: isHeader ? 'center' : (c === 3 ? 'left' : 'center'),
            wrapText: c === 3,
          },
          font: isHeader ? { bold: true } : undefined,
          fill: isHeader
            ? { patternType: 'solid', fgColor: { rgb: 'BFD7EA' } }
            : undefined,
        };
      }
    }

    // --- สรุปด้านล่าง (เหมือนในรูปตัวอย่าง) ---
    const summaryStart = rows.length + 3; // 1-based row index ใน Excel (เว้น 1 บรรทัด)
    const titleRow = summaryStart;
    const titleAddr = XLSX.utils.encode_cell({ r: titleRow - 1, c: 0 }); // A
    ws[titleAddr] = {
      t: 's',
      v: `สรุปใบสลลิปทั้งหมด ${rows.length} รายการ`,
      s: {
        font: { bold: true, sz: 16 },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { patternType: 'solid', fgColor: { rgb: 'FFC000' } },
        border,
      },
    };
    // merge A..E
    ws['!merges'] = (ws['!merges'] || []).concat([
      { s: { r: titleRow - 1, c: 0 }, e: { r: titleRow - 1, c: 4 } },
    ]);
    ws['!rows'] = ws['!rows'] || [];
    ws['!rows'][titleRow - 1] = { hpt: 30 };

    // สรุปตามบัตรแบบตาราง (5 คอลัมน์) — แถวบนเป็นชื่อบัตร, แถวล่างเป็น "ขาด n"
    const counts = new Map();
    for (const { card } of filteredUnmatched) {
      const label = cardLabel(card);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const cards = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count, vip: vipNumberFromLabel(label) }))
      .sort((a, b) => (a.vip - b.vip) || a.label.localeCompare(b.label));

    const cols = 5;
    const nameFill = { patternType: 'solid', fgColor: { rgb: 'FFF200' } }; // เหลือง (แถวชื่อบัตร)
    const missFill = { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } }; // ขาว (แถวขาด)
    const nameFont = { bold: true };
    const missFont = { bold: true };
    const center = { horizontal: 'center', vertical: 'center' };

    let idx = 0;
    let nameRow = titleRow + 1; // 1-based (แถวชื่อ)
    while (idx < cards.length) {
      const missRow = nameRow + 1; // แถว "ขาด"
      for (let c = 0; c < cols; c++) {
        const item = cards[idx];

        const nameAddr = XLSX.utils.encode_cell({ r: nameRow - 1, c });
        const missAddr = XLSX.utils.encode_cell({ r: missRow - 1, c });

        if (item) {
          ws[nameAddr] = {
            t: 's',
            v: item.label,
            s: { border, fill: nameFill, font: nameFont, alignment: center },
          };
          ws[missAddr] = {
            t: 's',
            v: `ขาด${item.count}`,
            s: { border, fill: missFill, font: missFont, alignment: center },
          };
        } else {
          ws[nameAddr] = { t: 's', v: '', s: { border, fill: nameFill, alignment: center } };
          ws[missAddr] = { t: 's', v: '', s: { border, fill: missFill, alignment: center } };
        }

        idx += 1;
      }

      // ปรับความสูงแถวให้เหมือนตารางในภาพ
      ws['!rows'] = ws['!rows'] || [];
      ws['!rows'][nameRow - 1] = { hpt: 22 };
      ws['!rows'][missRow - 1] = { hpt: 22 };

      nameRow += 2;
    }

    // ปรับความกว้างคอลัมน์ให้ summary อ่านง่ายขึ้นด้วย (สรุปใช้ A..E เหมือนกัน)
    ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 48 }, { wch: 20 }];

    // ขยาย ref ให้ครอบคลุม summary ด้านล่าง
    const endRow = Math.max(range.e.r + 1, nameRow); // 1-based
    ws['!ref'] = `A1:E${endRow}`;

    XLSX.utils.book_append_sheet(wb, ws, 'รายการที่ยังไม่ครบ');

    const fileName = 'รายการสลลิปน้ำมันที่ยังไม่ได้รับ.xlsx';
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, fileName);
  };

  return (
    <section className="mt-16">
    <div className="bg-gradient-to-r from-slate-200 via-sky-200 to-emerald-200 p-[1px] rounded-[34px] shadow-sm">
    <div className="bg-white rounded-[33px] p-6 md:p-8 border border-slate-100">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-1.5 h-6 bg-slate-400 rounded-full" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-slate-500" />
              <h3 className="text-xl font-bold text-slate-800 font-display">สรุป</h3>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              แสดงจำนวนที่จับคู่สำเร็จ และรายการที่ยังไม่ครบ
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
          title={open ? 'พับ' : 'ขยาย'}
        >
          <ChevronDown className={`w-5 h-5 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
      </div>

      <div className={`transition-all duration-300 ${open ? 'opacity-100 max-h-[20000px]' : 'opacity-0 max-h-0 overflow-hidden pointer-events-none'}`}>
      {!result ? (
        <div className="py-16 text-center">
            {slipResult?.pages?.length > 0 ? (
                <div className="max-w-md mx-auto">
                    <div className="bg-amber-50 border border-amber-200 rounded-3xl p-8 mb-4">
                        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4 text-amber-600">
                            <Receipt size={32} />
                        </div>
                        <h4 className="text-2xl font-black text-slate-900 mb-2">
                            พบสลิป {slipResult.pages.length} ใบ
                        </h4>
                        <p className="text-slate-600 text-sm">
                            อัปโหลดสลิปเรียบร้อยแล้ว กรุณาอัปโหลดใบแจ้งยอดเพื่อเริ่มการแมตช์ข้อมูลและตรวจสอบความถูกต้อง
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <AlertTriangle size={32} />
                    </div>
                    <p className="text-slate-500 font-medium italic">ยังไม่พบข้อมูลสรุป กรุณาอัปโหลดใบแจ้งยอด</p>
                </>
            )}
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-slate-500">จับคู่สำเร็จ</div>
                <div className="text-2xl font-extrabold text-slate-800">
                  {summary.matchedCount}/{summary.totalTxns}
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-slate-500">ยังไม่ครบ</div>
                <div className="text-2xl font-extrabold text-slate-800">
                  {summary.unmatchedCount}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {missingByCard.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-6">
          {matchedByCard.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-lg">สรุปตามบัตร (สลิปที่ได้)</h4>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <div className="text-slate-600 text-xs sm:text-sm bg-slate-50 border border-emerald-200 px-3 py-1.5 rounded-full w-fit">
                    ได้ทั้งหมด <span className="font-bold">{summary.matchedCount}</span> รายการ
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenMatchedByCard((v) => !v)}
                    className="p-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 transition-colors text-emerald-700"
                    title={openMatchedByCard ? 'พับ' : 'ขยาย'}
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform ${openMatchedByCard ? '' : '-rotate-90'}`} />
                  </button>
                </div>
              </div>

              <div className={`transition-all duration-300 ${openMatchedByCard ? 'opacity-100 max-h-[20000px]' : 'opacity-0 max-h-0 overflow-hidden pointer-events-none'}`}>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {matchedByCard.map((x) => (
                    <button
                      type="button"
                      key={x.label}
                      onClick={() => focusFirstMatchedTxn(x.label)}
                      className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/60 text-left hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                      title="ไปยังรายการที่จับคู่ได้ของบัตรนี้"
                    >
                      <div className="font-extrabold text-slate-900 text-base leading-snug">
                        {x.label}
                      </div>
                      <div className="text-emerald-800 text-base font-bold mt-1">
                        ได้ {x.count}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-slate-800 text-lg">สรุปตามบัตร (ขาดสลิป)</h4>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-slate-600 text-xs sm:text-sm bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full w-fit">
                ขาดทั้งหมด <span className="font-bold">{summary.unmatchedCount}</span> รายการ
              </div>
              <button
                type="button"
                onClick={() => setOpenMissingByCard((v) => !v)}
                className="p-2 rounded-xl border border-amber-200 hover:bg-amber-50 transition-colors text-amber-700"
                title={openMissingByCard ? 'พับ' : 'ขยาย'}
              >
                <ChevronDown className={`w-5 h-5 transition-transform ${openMissingByCard ? '' : '-rotate-90'}`} />
              </button>
            </div>
          </div>

          <div className={`transition-all duration-300 ${openMissingByCard ? 'opacity-100 max-h-[20000px]' : 'opacity-0 max-h-0 overflow-hidden pointer-events-none'}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {missingByCard.map((x) => (
                <button
                  type="button"
                  key={x.label}
                  onClick={() => focusCard(x.label)}
                  className="border border-amber-200 rounded-xl p-4 bg-amber-50/60 text-left hover:bg-amber-50 hover:border-amber-300 transition-colors"
                  title="ไปยังรายละเอียดบัตรนี้"
                >
                  <div className="font-extrabold text-slate-900 text-base leading-snug">
                    {x.label}
                  </div>
                  <div className="text-amber-800 text-base font-bold mt-1">
                    ขาด {x.count}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {summary.unmatchedCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h4 className="font-bold text-slate-800">
                รายการที่ยังไม่ครบ
                {query.trim() && (
                  <span className="text-slate-500 font-medium">
                    {' '}
                    (พบ {filteredUnmatched.length} รายการ)
                  </span>
                )}
              </h4>
            </div>
            <div className="w-full md:w-[560px] flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหา: ชื่อบัตร / วันที่ / รายการ / สาขา"
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 bg-white"
              />
              <button
                type="button"
                onClick={exportUnmatchedExcel}
                disabled={filteredUnmatched.length === 0}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center gap-2 ${
                  filteredUnmatched.length === 0
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                }`}
                title="Export Excel"
              >
                <Download className="w-4 h-4" />
                Export Excel
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-sm text-slate-600 border-b border-slate-200">
                  <th className="py-2 pr-4">ชื่อบัตร</th>
                  <th className="py-2 pr-4">วันที่</th>
                  <th className="py-2 pr-4">รายการ</th>
                  <th className="py-2 pr-4">สาขา</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredUnmatched.map(({ txn, card }, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">
                      {cardLabel(card)}
                    </td>
                    <td className="py-2 pr-4">{txn.date || '—'}</td>
                    <td className="py-2 pr-4">{stripBranchFromDesc(txn.desc)}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {extractBranch(txn.desc)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
    </div>
    </section>
  );
}

