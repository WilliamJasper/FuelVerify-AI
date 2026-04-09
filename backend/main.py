from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber
import io
import re
import base64
import json
import sqlite3

from PIL import Image, ImageOps
import pytesseract
import fitz  # PyMuPDF
import os
import threading
import tempfile
import subprocess
import shutil
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

# โหลด backend/.env (ถ้ามี) — ไฟล์นี้อยู่ใน .gitignore อย่า commit คีย์จริง
try:
    from dotenv import load_dotenv

    _BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_BACKEND_DIR, ".env"))
except ImportError:
    pass

# ตั้งค่าที่อยู่โปรแกรม Tesseract-OCR สำหรับ Windows
tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
if os.path.exists(tesseract_path):
    pytesseract.pytesseract.tesseract_cmd = tesseract_path

# ความเร็วสลิป: ปรับได้ด้วย env โดยไม่ต้องแก้โค้ด
# SLIP_PDF_DPI (ค่าเริ่ม 180) ลด DPI = เรนเดอร์ PDF เร็ว/ไฟล์เล็ก แต่ OCR อาจอ่อนลงเล็กน้อย
# SLIP_TYPHOON_MAX_RETRIES (ค่าเริ่ม 1) ลดรอบ = เร็วขึ้นมาก แต่ถ้า Typhoon อ่านเพี้ยนอาจต้องพึ่ง Tesseract/statement
# SLIP_OCR_WORKERS (ค่าเริ่ม 2) ประมวลผลหลายหน้า PDF พร้อมกัน (ไม่เกินจำนวนหน้า)
# SLIP_ROTATION_FALLBACK=1 (ค่าเริ่ม) ถ้าอ่านที่มุม 0° แล้วข้อมูลหลักหาย ให้ลองหมุน 90/180/270 กับ Typhoon (แก้สลิปถ่ายเอียง)
# SLIP_TYPHOON_TIMEOUT_SEC (ค่าเริ่ม 20) เวลารอ Typhoon ต่อ request
# SLIP_TYPHOON_FAIL_STREAK_BREAKER (ค่าเริ่ม 4) ถ้าล้มเหลวติดกันถึงค่านี้ ให้ข้าม Typhoon ชั่วคราวในรอบอัปโหลดนั้น
# TYPHOON_API_KEY — บังคับตั้งใน environment หรือ backend/.env (อย่าใส่คีย์ในโค้ด)
# TYPHOON_OCR_URL — ไม่บังคับ ค่าเริ่ม https://api.opentyphoon.ai/v1/ocr
SLIP_PDF_DPI = int(os.environ.get("SLIP_PDF_DPI", "180"))
SLIP_TYPHOON_MAX_RETRIES = int(os.environ.get("SLIP_TYPHOON_MAX_RETRIES", "1"))
SLIP_OCR_WORKERS = int(os.environ.get("SLIP_OCR_WORKERS", "2"))
SLIP_TYPHOON_TIMEOUT_SEC = max(5, int(os.environ.get("SLIP_TYPHOON_TIMEOUT_SEC", "20")))
SLIP_TYPHOON_FAIL_STREAK_BREAKER = max(2, int(os.environ.get("SLIP_TYPHOON_FAIL_STREAK_BREAKER", "4")))
SLIP_ROTATION_FALLBACK = os.environ.get("SLIP_ROTATION_FALLBACK", "1").strip().lower() not in (
    "0",
    "false",
    "no",
    "off",
)
SLIP_DEBUG_VERBOSE = os.environ.get("SLIP_DEBUG_VERBOSE", "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
# ถ้าเปิด: PDF ทุกไฟล์จะพยายามแปลงเป็น searchable text-layer ก่อนเข้า Typhoon
SLIP_FORCE_TEXT_LAYER = os.environ.get("SLIP_FORCE_TEXT_LAYER", "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
SLIP_TEXTLAYER_PROVIDER = (os.environ.get("SLIP_TEXTLAYER_PROVIDER") or "auto").strip().lower()
ILOVEPDF_PUBLIC_KEY = (os.environ.get("ILOVEPDF_PUBLIC_KEY") or "").strip()
ILOVEPDF_SECRET_KEY = (os.environ.get("ILOVEPDF_SECRET_KEY") or "").strip()
ILOVEPDF_REGION = (os.environ.get("ILOVEPDF_REGION") or "eu").strip().lower()
ILOVEPDF_TIMEOUT_SEC = max(15, int(os.environ.get("ILOVEPDF_TIMEOUT_SEC", "120")))
app = FastAPI()

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fuelverify.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # ตารางเก็บข้อมูล Record หลัก (Metadata + Statement Results)
    c.execute('''CREATE TABLE IF NOT EXISTS records
                 (id TEXT PRIMARY KEY, name TEXT, date TEXT, type TEXT, data TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    # ตารางเก็บรูปภาพและผล OCR แบบละเอียด (แทน IndexedDB)
    c.execute('''CREATE TABLE IF NOT EXISTS slip_blobs
                 (id TEXT PRIMARY KEY, data TEXT)''')
    conn.commit()
    conn.close()

init_db()

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_kasikorn_ocr(pdf_bytes):
    data_rows = []
    card_map = {} # card_no_no_space -> index in data_rows
    seen_cards = set()
    
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        # Page 1: Card List Summary
        p1 = pdf.pages[0]
        text = p1.extract_text()
        if text:
            for line in text.split('\n'):
                line = line.strip()
                tokens = line.split()
                # Pattern: [4 digits] [70XX] [XXXX] [4 digits] [Name...] [Limit] [Balance] [Min Payment]
                if len(tokens) >= 7 and tokens[1] == '70XX' and tokens[2] == 'XXXX':
                    card_no = f"{tokens[0]} {tokens[1]} {tokens[2]} {tokens[3]}"
                    no_space_card = re.sub(r'\s+', '', card_no)
                    
                    if no_space_card not in seen_cards:
                        seen_cards.add(no_space_card)
                        
                        # Amounts are usually at the end. Let's find the first money-like token after card_no
                        # Money usually has ',' or '.'
                        amt_starts_at = -1
                        for i in range(4, len(tokens)):
                            if re.search(r'[\d,]+\.\d{2}', tokens[i]) or (len(tokens[i]) >= 5 and re.match(r'^[\d,.-]+$', tokens[i])):
                                amt_starts_at = i
                                break
                        
                        if amt_starts_at != -1 and amt_starts_at + 2 < len(tokens):
                            account_full_name = " ".join(tokens[4:amt_starts_at])
                            credit_limit = tokens[amt_starts_at]
                            balance = tokens[amt_starts_at+1]
                            min_payment = tokens[amt_starts_at+2]
                        else:
                            # Fallback if logic above fails
                            account_full_name = " ".join(tokens[4:-3])
                            credit_limit = tokens[-3] if len(tokens) > 3 else "0.00"
                            balance = tokens[-2] if len(tokens) > 2 else "0.00"
                            min_payment = tokens[-1] if len(tokens) > 1 else "0.00"

                        # Extract ID number from name (e.g., "VIP 36" -> "36")
                        name_num_match = re.search(r'(\d+)', account_full_name)
                        display_id = name_num_match.group(1) if name_num_match else tokens[3]

                        data_rows.append({
                            "card_no": card_no,
                            "card_id": display_id,
                            "account_name": account_full_name.strip(),
                            "credit_limit": credit_limit,
                            "balance": balance,
                            "min_payment": min_payment,
                            "previous_balance": "0.00",
                            "total_balance_calc": "0.00",
                            "transaction_count": 0,
                            "transactions": []
                        })
                        card_map[no_space_card] = len(data_rows) - 1

        # Subsequent Pages: Transactions
        current_card_index = None
        for page in pdf.pages[1:]:
            p_text = page.extract_text()
            if not p_text: continue

            # Guardrail: only parse pages that look like per-card details pages.
            # Prevents accidentally attaching "Methods of Payment..." (etc.) to the last seen card.
            if "ACCOUNT DETAILS" not in p_text.upper():
                continue
            
            for line in p_text.split('\n'):
                line = line.strip()
                
                # Identify Card section
                card_match = re.search(r'CARD\s+(?:TYPE)?\s*(\d{4}\s*70XX\s*XXXX\s*\d{4})', line, re.IGNORECASE)
                if card_match:
                    found_no = re.sub(r'\s+', '', card_match.group(1))
                    if found_no in card_map:
                        current_card_index = card_map[found_no]
                
                if current_card_index is not None:
                    # Match PREVIOUS BALANCE
                    # Statement text often contains footnote digits glued to the label,
                    # e.g. "PREVIOUS BALANCE1 4,780.10" — grab the final money token.
                    prev_bal_match = re.search(
                        r'PREVIOUS\s+BALANCE.*?([\d,]+\.\d{2})\s*$',
                        line,
                        re.IGNORECASE
                    )
                    if prev_bal_match:
                        data_rows[current_card_index]["previous_balance"] = prev_bal_match.group(1)

                    # Match TOTAL BALANCE (from bottom of txn page)
                    # Example: "***** TOTAL BALANCE *****7 3,910.00"
                    total_bal_match = re.search(
                        r'TOTAL\s+BALANCE.*?([\d,]+\.\d{2})\s*$',
                        line,
                        re.IGNORECASE
                    )
                    if total_bal_match:
                        data_rows[current_card_index]["total_balance_calc"] = total_bal_match.group(1)

                    # Match txn: [Date] [PostDate] [Description] [Amount]
                    # We look for date pattern at start
                    txn_match = re.search(r'^(\d{2}/\d{2}/\d{2})\s+(\d{2}/\d{2}/\d{2})\s+(.*?)\s+([\d,.-]+)$', line)
                    if txn_match:
                        date = txn_match.group(1)
                        post_date = txn_match.group(2)
                        desc = txn_match.group(3).strip()
                        amount = txn_match.group(4)
                        
                        # Aggressively clean trailing digits (sequence numbers/footnotes) from description
                        # e.g. "JORHOR2" -> "JORHOR" แต่ระวังสาขาที่ลงท้ายด้วยตัวเลข
                        # เปลี่ยนเป็นลบเฉพาะตัวเลขที่ติดมาท้ายสุดจริงๆ และไม่มีเว้นวรรค เช่น NAKHONRATSIMA14 -> NAKHONRATSIMA
                        desc = re.sub(r'(?<=[A-Za-zก-๙])\d{1,2}$', '', desc).strip()
                        
                        txn_type = "ชำระเงิน" if any(k in desc.upper() for k in ["PAYMENT", "THANK YOU"]) else "เติมน้ำมัน"
                        
                        # Clean amount from multiple dashes if it's a payment
                        if txn_type == "ชำระเงิน":
                            amount = amount.replace('--', '-').replace('-', '')

                        # Deduplicate transactions
                        is_duplicate = any(
                            t['date'] == date and t['post_date'] == post_date and t['desc'] == desc and t['amount'] == amount
                            for t in data_rows[current_card_index]["transactions"]
                        )
                        
                        if not is_duplicate:
                            data_rows[current_card_index]["transactions"].append({
                                "date": date,
                                "post_date": post_date,
                                "desc": desc,
                                "type": txn_type,
                                "amount": amount
                            })
                            data_rows[current_card_index]["transaction_count"] += 1

                    # Match interest charge (Kasikorn statements may show it with a single date)
                    # Example: "28/02/26 INTEREST CHARGE14 204.75"
                    interest_match = re.search(
                        r'^(\d{2}/\d{2}/\d{2})\s+INTEREST\s+CHARGE\d*\s+([\d,.-]+)$',
                        line,
                        re.IGNORECASE
                    )
                    if interest_match:
                        date = interest_match.group(1)
                        post_date = date
                        desc = "INTEREST CHARGE"
                        amount = interest_match.group(2)

                        is_duplicate = any(
                            t['date'] == date and t['post_date'] == post_date and t['desc'] == desc and t['amount'] == amount
                            for t in data_rows[current_card_index]["transactions"]
                        )
                        if not is_duplicate:
                            data_rows[current_card_index]["transactions"].append({
                                "date": date,
                                "post_date": post_date,
                                "desc": desc,
                                "type": "INTEREST",
                                "amount": amount
                            })
                            data_rows[current_card_index]["transaction_count"] += 1
                            
    return data_rows


def _image_from_upload_bytes(filename: str, content: bytes) -> Image.Image:
    """
    Supports:
    - PDF (uses first page)
    - common images: png/jpg/jpeg/webp
    """
    lower = (filename or "").lower()
    if lower.endswith(".pdf"):
        doc = fitz.open(stream=content, filetype="pdf")
        if doc.page_count < 1:
            raise ValueError("Empty PDF")
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=SLIP_PDF_DPI, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        doc.close()
        return img

    try:
        return Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as e:
        raise ValueError(f"Unsupported file type: {filename}") from e



def _parse_slip_text(ocr_text: str) -> dict:
    """
    Parse OCR text จากสลิปน้ำมัน PTT เพื่อดึง merchant, date, last4, amount
    """
    merchant = None
    date = None
    time_ = None
    last4 = None
    amount = None
    card_type = None

    # ===== ลบ HTML tags และ Markdown ออก =====
    # ใส่ newline ที่ </tr> เพื่อรักษาโครงสร้างแถวของ table
    clean_text = re.sub(r'</tr>', '\n', ocr_text, flags=re.IGNORECASE)
    # ลบ <br/> แทนด้วย space
    clean_text = re.sub(r'<br\s*/?>', ' ', clean_text, flags=re.IGNORECASE)
    # ลบ HTML tags ที่เหลือ
    clean_text = re.sub(r'<[^>]+>', ' ', clean_text)
    # ลบ markdown bold ** เฉพาะที่ติดกับ word character (ไม่ลบ literal ** เช่น THB **)
    clean_text = re.sub(r'\*\*(?=\w)', '', clean_text)  # opening ** ก่อนตัวอักษร
    clean_text = re.sub(r'(?<=\w)\*\*', '', clean_text)  # closing ** หลังตัวอักษร
    # ลบ whitespace ซ้ำ
    clean_text = re.sub(r'[ \t]+', ' ', clean_text)

    lines = clean_text.split('\n')

    # --- Merchant: หาชื่อสาขาจริง (PTTRM / PTTST.D / X.D pattern) ---
    # 1. หา PTTRM ก่อน (จับแค่บรรทัดเดียวกัน ไม่ข้าม newline)
    pttrm_search = re.search(r'(PTTRM)[ \t]+(\S+(?:[ \t]+\S+)?)', clean_text, re.IGNORECASE)
    if pttrm_search:
        location = pttrm_search.group(2).strip()
        location = re.sub(r'\s*\d{2,3}[-‐]\d{5,7}.*', '', location).strip()
        location = re.sub(r'\s*KORAT.*', '', location, flags=re.IGNORECASE).strip()
        location = re.sub(r'\s*NAKORN\w*.*', '', location, flags=re.IGNORECASE).strip()
        location = re.sub(r'^(KR|KM)([A-Z])', r'\1 \2', location, flags=re.IGNORECASE)
        merchant = f"PTTRM_{location}"

    # 2. หา PTTST.D (มีจุด = ชื่อสาขา)
    if not merchant:
        pttst_search = re.search(r'(PTTST\.\S*)\s+(.*?)(?:\s+TID:|\s+NAKORN\w*|\s+\d{2,3}[-‐]\d{5,7}|$)', clean_text, re.IGNORECASE)
        if pttst_search:
            prefix = pttst_search.group(1).strip()
            location = pttst_search.group(2).strip()
            location = re.sub(r'\s*NAKORN\w*\s*', '', location, flags=re.IGNORECASE).strip()
            location = re.sub(r'\s*TID:.*', '', location, flags=re.IGNORECASE).strip()
            location = re.sub(r'\s*\d{2,3}[-‐]\d{5,7}.*', '', location).strip()
            merchant = f"{prefix}_{location}"

    # 3. Fallback: หา pattern X.D ที่ OCR อ่านผิด (เช่น FTISF.D, FTTST.D แทน PTTST.D)
    if not merchant:
        fuzzy_search = re.search(r'(\w{3,6}\.D)\s+((?:PR\s+)?[A-Z][A-Z\s.]+?)(?:\s+NAKORN\w*|\s+MAKORN\w*|\s+TID:|\s+\d{2,3}[-‐]\d{5,7}|$)', clean_text, re.IGNORECASE)
        if fuzzy_search:
            prefix = "PTTST.D"
            location = fuzzy_search.group(2).strip()
            location = re.sub(r'\s*[MN]AKORN\w*\s*', '', location, flags=re.IGNORECASE).strip()
            merchant = f"{prefix}_{location}"

    # 4. Fallback: OCR อ่านเป็น "PTT STATION D BANMAI..." หรือ "FIRST : D BANMAI..."
    if not merchant:
        station_d = re.search(r'(?:PTT\s+)?STATION\s+D\s+(.*?)(?:\s+NAKORN\w*|\s+MAKORN\w*|\s+TID:|$)', clean_text, re.IGNORECASE)
        if station_d:
            location = station_d.group(1).strip()
            location = re.sub(r'\s*[MN]AKORN\w*\s*', '', location, flags=re.IGNORECASE).strip()
            merchant = f"PTTST.D_{location}"

    # 5. Fallback: OCR อ่านเป็น "FIRST : D BANMAI..." หรือ "FIRST : BANMAI..." (อาจมีหรือไม่มี D)
    if not merchant:
        first_d = re.search(r'FIRST\s*:?\s+(?:D\s+)?(.*?)(?:\s+[MN]AKORN\w*|\s+TID:|$)', clean_text, re.IGNORECASE)
        if first_d:
            location = first_d.group(1).strip()
            location = re.sub(r'\s*[MN]AKORN\w*\s*', '', location, flags=re.IGNORECASE).strip()
            merchant = f"PTTST.D_{location}"

    # 6. Fallback สุดท้าย: หาชื่อสถานที่ที่รู้จักโดยตรง
    if not merchant:
        known_locations = [
            (r'\b(BANMAI\s+(?:MAHACHAI|PETROLEU?M?))', 'PTTST.D'),
            (r'\b(PONGKIT\s+BR\.?\s*\d?)', 'PTTST.D'),
            (r'\b(PR\s+PETROLEUM\s+PT)', 'PTTST.D'),
            (r'\b(JANPRASITH\s+PETR(?:\s+SARABURI)?)', 'PTTST.D'),
            (r'\b(KR\s*JORHOR)', 'PTTRM'),
        ]
        for pattern, prefix in known_locations:
            loc_match = re.search(pattern, clean_text, re.IGNORECASE)
            if loc_match:
                location = loc_match.group(1).strip()
                if prefix == 'PTTRM':
                    location = re.sub(r'^(KR|KM)([A-Z])', r'\1 \2', location, flags=re.IGNORECASE)
                merchant = f"{prefix}_{location}"
                break

    if merchant:
        # ตัด noise ที่ OCR ชอบพ่วงท้ายชื่อร้าน เช่น TRACE/APPR/TID/DATE/TIME
        merchant = re.sub(
            r"\s+(?:TRACE|APPR|TID|RRN|REF|STAN|DATE|TIME)\s*:?\s*[A-Z0-9:/\-]+.*$",
            "",
            merchant,
            flags=re.IGNORECASE,
        ).strip()

    def _safe_last4(candidate: str):
        if not candidate:
            return None
        c = str(candidate).strip()
        # ตัดเลขที่มักเป็นปี (รูปแบบสลิป) / ค่าวันที่ และเลขซ้ำ
        if not (re.fullmatch(r"\d{4}", c) and c != "0000"):
            return None
        if c.startswith("20") or c.startswith("19"):
            return None
        if c in ("2602", "0226", "1602", "0216"):
            return None
        return c

    def _line_toxic_for_last4(line: str) -> bool:
        """บรรทัดที่มักมีเลขอนุมัติ/แทร็ค/เวลา — ห้ามดึง last4 จากที่นี่"""
        s = (line or "").upper()
        if re.search(r"\b(APPR|AUTH|TRACE|TID|RRN|REF|STAN)\s*:", s):
            return True
        if re.search(r"\bPOST\s*DATE\b", s):
            return True
        if "AVAILABLE BALANCE" in s or ("TOTAL" in s and "THB" in s):
            return True
        return False

    # วนหาเป็นรอบ ๆ เพื่อให้เก็บค่าได้ครบที่สุดจาก OCR text เดียวกัน
    for _ in range(4):
        # --- Date: รูปแบบ dd/mm/yy หรือ dd/mm/yyyy ---
        if not date:
            date_match = re.search(r'DATE\s*:?\s*(\d{2}/\d{2}/\d{2,4})', clean_text, re.IGNORECASE)
            if date_match:
                date = date_match.group(1)
            else:
                date_match2 = re.search(r'(\d{2}/\d{2}/\d{2,4})', clean_text)
                if date_match2:
                    date = date_match2.group(1)

        # --- Time: รูปแบบ HH:MM:SS ---
        if not time_:
            time_match = re.search(r'TIME\s*:?\s*(\d{2}:\d{2}(?::\d{2})?)', clean_text, re.IGNORECASE)
            if time_match:
                time_ = time_match.group(1)
            else:
                generic_time = re.search(r'(?<!\d)(\d{2}:\d{2}(?::\d{2})?)(?!\d)', clean_text)
                if generic_time:
                    time_ = generic_time.group(1)

        # --- Last 4 digits ของบัตร ---
        if not last4:
            # 0) จับเลขท้าย mask แบบกว้าง (รองรับบรรทัดที่รวม DATE/TIME/APPR ในบรรทัดเดียว)
            m = re.search(
                r'(?:\*|X){2,}(?:[\s\*Xx]|[^\d\n]){0,40}?(\d{4})(?!\d)',
                clean_text,
                re.IGNORECASE,
            )
            last4 = _safe_last4(m.group(1) if m else None)

        if not last4:
            # 1) **** **** **** 5706 / *** *** **** 5706 (อย่างน้อย 2 กลุ่ม mask ก่อนเลข)
            m = re.search(
                r'(?:\*[\s\*•·]*){2,}\b(\d{4})(?!\d)',
                clean_text,
            )
            last4 = _safe_last4(m.group(1) if m else None)

        if not last4:
            # 1b) OCR อ่าน X แทน *: XXXX XXXX 5706
            m = re.search(
                r'(?:\bX{3,4}\b\s*){2,}\b(\d{4})(?!\d)',
                clean_text,
                re.IGNORECASE,
            )
            last4 = _safe_last4(m.group(1) if m else None)

        if not last4:
            # 1c) เลข 4 หลักท้ายบรรทัดที่มี mask ปนข้อความ
            for line in lines:
                if not re.search(r'[\*Xx]{2,}', line):
                    continue
                # ถ้าเป็นบรรทัดที่มี SALE/NON ETAX ให้อนุญาต แม้มี DATE/TIME/APPR ปน
                if _line_toxic_for_last4(line) and not re.search(r'SALE\s+PTT|NON\s+ETAX|FLEET', line, re.IGNORECASE):
                    continue
                m = re.search(r'(?:\*|X){1,}[\s\*Xx]*(\d{4})(?!\d)', line, re.IGNORECASE)
                if m:
                    last4 = _safe_last4(m.group(1))
                    if last4:
                        break

        if not last4:
            # 2) บรรทัดระบุเลขบัตรโดยตรง
            m = re.search(r'(?:CARD\s*(?:NO|NUMBER)?|เลขบัตร)\s*[:\-]?\s*(?:\*+\s*){1,6}(\d{4})(?!\d)', clean_text, re.IGNORECASE)
            last4 = _safe_last4(m.group(1) if m else None)

        if not last4:
            # 3) เลข 4 ตัวที่อยู่ชิดคำว่า SALE PTT / NON ETAX (ไม่ใช้ถ้าบรรทัดมี APPR/TID/TIME)
            for line in lines:
                if not re.search(r'SALE\s+PTT|NON\s+ETAX', line, re.IGNORECASE):
                    continue
                m = re.search(
                    r'(?<!\d)(\d{4})(?!\d)\s+(?:SALE\s+PTT|NON\s+ETAX)',
                    line,
                    re.IGNORECASE,
                )
                if m:
                    last4 = _safe_last4(m.group(1))
                    if last4:
                        break
                # OCR บางรอบวางเลขไว้หลัง SALE/NON ETAX
                m2 = re.search(
                    r'(?:SALE\s+PTT|NON\s+ETAX).{0,24}?(?<!\d)(\d{4})(?!\d)',
                    line,
                    re.IGNORECASE,
                )
                if m2:
                    last4 = _safe_last4(m2.group(1))
                    if last4:
                        break

        if not last4:
            # 4) หาใกล้บรรทัด key words — ข้ามบรรทัดที่มีรหัสอนุมัติ/แทร็ค
            for i, line in enumerate(lines):
                if not re.search(r'SALE\s+PTT|NON\s+ETAX|FLEET|Fleet\s*\(|CARD', line, re.IGNORECASE):
                    continue
                if _line_toxic_for_last4(line):
                    continue
                nearby_lines = [lines[j] for j in range(max(0, i - 1), min(len(lines), i + 2))]
                for nearby_line in nearby_lines:
                    if _line_toxic_for_last4(nearby_line):
                        continue
                    # ถ้าบรรทัดมี mask ให้จับเลขท้ายบรรทัดก่อน
                    if re.search(r'[\*Xx]{2,}', nearby_line):
                        m = re.search(r'(?:\*|X){1,}[\s\*Xx]*(\d{4})\s*$', nearby_line, re.IGNORECASE)
                        if m:
                            last4 = _safe_last4(m.group(1))
                            if last4:
                                break
                    if last4:
                        break
                    nums = re.findall(r'\b(\d{4})\b', nearby_line)
                    for num in reversed(nums):
                        good = _safe_last4(num)
                        if good:
                            last4 = good
                            break
                    if last4:
                        break
                if last4:
                    break

        if not last4:
            # 5) บาง OCR วางเลขบัตรตรงคอลัมน์ระยะทาง
            m = re.search(r'(?:เลข)?ระยะทาง\s*\(?\s*KM\s*\)?\s*:?\s*(\d{4})\b', clean_text, re.IGNORECASE)
            last4 = _safe_last4(m.group(1) if m else None)

        if not card_type:
            card_type_patterns = [
                r'CARD\s*TYPE\s*[:\-]?\s*(VISA|MASTER(?:CARD)?|JCB|UNIONPAY|FLEET(?:\s*CARD)?)',
                r'\b(SALE\s+PTT\s+FLEET(?:\s+CARD)?)\b',
                r'\b(PTT\s+FLEET(?:\s+CARD)?)\b',
            ]
            for pat in card_type_patterns:
                m = re.search(pat, clean_text, re.IGNORECASE)
                if m:
                    card_type = re.sub(r'\s+', ' ', m.group(1).upper()).strip()
                    break

        if date and time_ and last4 and card_type:
            break

    # --- Amount: ดึงเฉพาะ TOTAL แบบ conservative ---
    # หลักการ: ถ้าไม่ชัดเจนให้คืน None ดีกว่าคืนค่าผิดจาก AVAILABLE BALANCE
    text_norm = clean_text

    def _reconcile_total_if_absurd_vs_balance(raw_amount: str, full_text: str) -> str:
        """
        Typhoon/OCR มักอ่าน 200.00 เป็น 200,000.00 (ใส่ comma + ศูนย์เกิน)
        ถ้ามี AVAILABLE BALANCE บรรทัดเดียวกันและ TOTAL > balance ชัดเจนเกินไป
        ให้ลองใช้ total/1000 เมื่อหารลงตัวและยัง <= balance
        """
        if not raw_amount or not full_text:
            return raw_amount
        try:
            v_amt = float(str(raw_amount).replace(",", ""))
        except ValueError:
            return raw_amount
        for line in full_text.split("\n"):
            if not re.search(r"TOTAL\s*:?\s*THB", line, re.IGNORECASE):
                continue
            if not re.search(r"AVAILABLE\s+BALANCE", line, re.IGNORECASE):
                continue
            bm = re.search(
                r"AVAILABLE\s+BALANCE\s+([\d,]+\.\d{2})",
                line,
                re.IGNORECASE,
            )
            if not bm:
                continue
            try:
                v_bal = float(bm.group(1).replace(",", ""))
            except ValueError:
                continue
            if v_bal <= 0 or v_amt <= v_bal:
                return raw_amount
            # ยอดซื้อต้องไม่มากกว่ายอดคงเหลือ — ถ้ามากกว่ามาก แปลว่าอ่าน TOTAL ผิด
            if v_amt < 1000:
                return raw_amount
            if v_amt % 1000 != 0:
                return raw_amount
            cand = v_amt / 1000.0
            if cand < 1 or cand > 50_000:
                return raw_amount
            if cand > v_bal * 1.05:
                return raw_amount
            # กันเคสจ่ายจริงหลักหมื่น: ต้อง "โต้ง" พอสมควร (เช่น 200,000 กับ balance 5,500)
            if v_amt <= 30 * v_bal:
                return raw_amount
            return f"{cand:.2f}"
        # ถ้าไม่พบเงื่อนไขที่ต้อง reconcile (เช่น ไม่มีตัวเลข AVAILABLE BALANCE)
        # ให้คงค่า TOTAL ตามที่อ่านได้เดิม
        return raw_amount

    # 1) ยึดบรรทัด TOTAL ก่อนเสมอ
    lines_local = text_norm.split('\n')
    for i, line in enumerate(lines_local):
        if not re.search(r'TOTAL', line, re.IGNORECASE):
            continue

        # เคส "TOTAL ... AVAILABLE BALANCE 300.00 6,500.00" -> เอาตัวแรก
        if re.search(r'AVAILABLE\s+BALANCE', line, re.IGNORECASE):
            nums_in_line = re.findall(r'([\d,]+\.\d{2})', line)
            if len(nums_in_line) >= 2:
                amount = nums_in_line[0]
                break
            # เคส OCR ทั่วไป: TOTAL : THB ** 500.00 AVAILABLE BALANCE (ไม่มีเลข balance ต่อท้าย)
            one_total = re.search(
                r'TOTAL\s*:?\s*THB[^\d\n]{0,24}([\d,]+\.\d{2})\s+AVAILABLE\s+BALANCE',
                line,
                re.IGNORECASE,
            )
            if one_total:
                amount = one_total.group(1)
                break
            # ถ้ามี AVAILABLE BALANCE แต่เจอตัวเลขเดียว มักเป็น balance ห้ามใช้เป็น TOTAL
            continue

        # เคส "TOTAL : THB 500.00"
        nums_in_line = re.findall(r'([\d,]+\.\d{2})', line)
        if nums_in_line:
            amount = nums_in_line[0]
            break

        # เคส TOTAL อยู่บรรทัดบน, ตัวเลขอยู่บรรทัดถัดไป (แต่ต้องไม่ใช่บรรทัด balance)
        if i + 1 < len(lines_local):
            next_line = lines_local[i + 1].strip()
            if (
                re.match(r'^[\d,]+\.\d{2}$', next_line)
                and not re.search(r'AVAILABLE\s+BALANCE', next_line, re.IGNORECASE)
            ):
                amount = next_line
                break

    if not amount:
        # เคสที่ OCR แยกบรรทัด:
        # TOTAL : THB ** CUSTOMER COPY **
        # 1,100.00
        # AVAILABLE BALANCE 5,070.00
        # ให้ดึงบรรทัดถัดจาก TOTAL เป็นยอดซื้อ
        split_total_match = re.search(
            r'TOTAL\s*:?\s*THB[\s\S]{0,60}?CUSTOMER\s+COPY[\s\S]{0,40}?\n\s*([\d,]+\.\d{2})\s*\n\s*AVAILABLE\s+BALANCE\s+([\d,]+\.\d{2})',
            text_norm,
            re.IGNORECASE,
        )
        if split_total_match:
            try:
                v_total = float(split_total_match.group(1).replace(',', ''))
                v_avail = float(split_total_match.group(2).replace(',', ''))
                if 1 <= v_total <= 50_000 and v_avail >= v_total:
                    amount = split_total_match.group(1)
            except ValueError:
                pass

    if not amount:
        # เคสที่ OCR แยกบรรทัดและไม่มี AVAILABLE BALANCE ต่อท้าย:
        # TOTAL : THB ** CUSTOMER COPY **
        # 920.00
        split_total_simple = re.search(
            r'TOTAL\s*:?\s*THB[\s\S]{0,40}?CUSTOMER\s+COPY[\s\S]{0,20}?\n\s*([\d,]+\.\d{2})',
            text_norm,
            re.IGNORECASE,
        )
        if split_total_simple:
            try:
                v = float(split_total_simple.group(1).replace(',', ''))
                if 1 <= v <= 50_000:
                    amount = split_total_simple.group(1)
            except ValueError:
                pass

    if not amount:
        # เคส table OCR: "TOTAL : THB AVAILABLE BALANCE" แล้วตามด้วยตัวเลข 2 ตัว
        # ให้ยึดตัวแรกเป็น TOTAL
        table_pair = re.search(
            r'TOTAL\s*:?\s*THB\s+AVAILABLE\s+BALANCE[\s\S]{0,120}?([\d,]+\.\d{2})\s+([\d,]+\.\d{2})',
            text_norm,
            re.IGNORECASE,
        )
        if table_pair:
            try:
                v1 = float(table_pair.group(1).replace(',', ''))
                if 1 <= v1 <= 50_000:
                    amount = table_pair.group(1)
            except ValueError:
                pass

    if not amount:
        # เคส OCR ทั่วไป:
        # TOTAL : THB ** CUSTOMER COPY **
        # AVAILABLE BALANCE 300.00 6,500.00
        # ให้ยึดเลขตัวแรกเป็น TOTAL
        cc_avail_pair = re.search(
            r'TOTAL\s*:?\s*THB[\s\S]{0,80}?CUSTOMER\s+COPY[\s\S]{0,80}?AVAILABLE\s+BALANCE\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})',
            text_norm,
            re.IGNORECASE,
        )
        if cc_avail_pair:
            try:
                v1 = float(cc_avail_pair.group(1).replace(',', ''))
                v2 = float(cc_avail_pair.group(2).replace(',', ''))
                # ส่วนใหญ่รูปแบบนี้เลขแรกคือ TOTAL เลขที่สองคือ BALANCE
                if 1 <= v1 <= 50_000 and v2 >= v1:
                    amount = cc_avail_pair.group(1)
            except ValueError:
                pass

    if amount:
        amount = _reconcile_total_if_absurd_vs_balance(amount, text_norm)

    return {
        "merchant": merchant,
        "date": date,
        "time": time_,
        "last4": last4,
        "amount": amount,
        "cardType": card_type,
    }


def _slip_data_score(values: dict) -> int:
    """ให้คะแนนความครบถ้วนของข้อมูลสลิป เพื่อเลือก OCR รอบที่ดีที่สุด"""
    score = 0
    if values.get("amount"):
        score += 4
    if values.get("date"):
        score += 4
    if values.get("last4"):
        score += 3
    if values.get("cardType"):
        score += 2
    if values.get("merchant"):
        score += 2
    if values.get("time"):
        score += 1
    return score


def _amount_has_total_evidence(raw_text: str, amount: str) -> bool:
    """ยอมรับยอดจาก OCR สำรองเฉพาะเมื่อมีหลักฐาน TOTAL คู่ยอดนั้นจริง"""
    if not raw_text or not amount:
        return False
    text = str(raw_text)
    amt = re.escape(str(amount))
    # ให้ยืดหยุ่นขึ้น: ยอมรับแม้จะอยู่คนละบรรทัด หรือมีข้อความ CUSTOMER COPY คั่น (ระยะไม่เกิน 60-80 ตัวอักษร)
    if re.search(rf"TOTAL\s*:?\s*THB[\s\S]{0,80}?{amt}", text, re.IGNORECASE):
        return True
    return False


def _build_page_quality(ocr_text: str, values: dict) -> dict:
    text = (ocr_text or "").upper()
    v = values or {}

    def field_score(name: str):
        val = v.get(name)
        if not val:
            return 0.0, "ไม่พบค่า"

        if name == "date":
            if re.search(r"DATE\s*:?\s*\d{2}/\d{2}/\d{2,4}", text):
                return 0.95, "พบ DATE ชัดเจน"
            if re.search(r"\d{2}/\d{2}/\d{2,4}", text):
                return 0.75, "พบรูปแบบวันที่ทั่วไป"
            return 0.55, "ดึงได้แต่หลักฐานในข้อความต่ำ"

        if name == "time":
            if re.search(r"TIME\s*:?\s*\d{2}:\d{2}(?::\d{2})?", text):
                return 0.95, "พบ TIME ชัดเจน"
            if re.search(r"\d{2}:\d{2}(?::\d{2})?", text):
                return 0.7, "พบรูปแบบเวลา"
            return 0.5, "ดึงได้แต่หลักฐานในข้อความต่ำ"

        if name == "last4":
            if re.search(r"(?:\*[\s\*•·]*){2,}\b\d{4}(?!\d)", text):
                return 0.95, "พบเลข 4 ตัวคู่กับ mask"
            if re.search(r"(?:\bX{3,4}\b\s*){2,}\b\d{4}(?!\d)", text):
                return 0.92, "พบเลข 4 ตัวคู่กับ mask (X)"
            if re.search(r"\*+\s*\*+[\s*]*\d{4}(?!\d)", text):
                return 0.95, "พบเลข 4 ตัวคู่กับ mask"
            if re.search(r"(SALE\s+PTT|NON\s+ETAX).{0,20}\d{4}|\d{4}.{0,20}(SALE\s+PTT|NON\s+ETAX)", text):
                return 0.8, "พบเลข 4 ตัวใกล้บรรทัดรายการ"
            return 0.6, "เลข 4 ตัวมาจาก fallback / OCR สำรอง"

        if name == "merchant":
            if re.search(r"PTTST\.D|PTTRM|STATION\s+D", text):
                return 0.9, "พบ prefix ร้านชัดเจน"
            return 0.65, "ชื่อร้านมาจาก fallback"

        if name == "amount":
            amount_text = str(val)
            if re.search(rf"TOTAL\s*:?\s*THB[^\n]{{0,24}}{re.escape(amount_text)}", text):
                return 0.95, "พบ TOTAL คู่ยอดโดยตรง"
            if re.search(
                rf"TOTAL\s*:?\s*THB[\s\S]{{0,80}}?AVAILABLE\s+BALANCE[\s\S]{{0,40}}?{re.escape(amount_text)}",
                text,
                re.IGNORECASE,
            ):
                return 0.9, "พบรูปแบบ TOTAL/AVAILABLE BALANCE แบบตาราง"
            if re.search(
                rf"TOTAL\s*:?\s*THB[\s\S]{{0,120}}?{re.escape(amount_text)}",
                text,
                re.IGNORECASE,
            ):
                return 0.85, "พบ TOTAL คู่ยอดในหลายบรรทัด"
            if re.search(r"TOTAL\s*:?\s*THB.*CUSTOMER\s+COPY", text):
                return 0.75, "ยอดมาจากเคส TOTAL/CUSTOMER COPY"
            if re.search(r"TOTAL", text):
                return 0.7, "พบ TOTAL แต่โครงสร้าง OCR เพี้ยน"
            return 0.5, "ดึงยอดจาก fallback"

        if name == "cardType":
            if re.search(r"CARD\s*TYPE|PTT\s+FLEET|SALE\s+PTT\s+FLEET", text):
                return 0.85, "พบประเภทบัตร"
            return 0.55, "ไม่พบประเภทบัตรชัดเจน"

        return 0.5, "ดึงได้"

    field_conf = {}
    reasons = []
    for key in ("merchant", "date", "time", "last4", "amount", "cardType"):
        conf, reason = field_score(key)
        field_conf[key] = round(conf, 2)
        if conf < 0.75:
            reasons.append(f"{key}: {reason}")

    confidence = round(sum(field_conf.values()) / len(field_conf), 2)
    needs_review = confidence < 0.78 or any(vv < 0.7 for vv in field_conf.values())
    return {
        "confidence": confidence,
        "field_confidence": field_conf,
        "needs_review": needs_review,
        "reasons": reasons[:5],
    }


def _images_from_upload_bytes(filename: str, content: bytes) -> list:
    """
    ดึงรูปภาพจากไฟล์ที่อัปโหลด - รองรับหลายหน้า (PDF)
    Returns: list of PIL Image objects (1 per page)
    """
    lower = (filename or "").lower()
    if lower.endswith(".pdf"):
        doc = fitz.open(stream=content, filetype="pdf")
        if doc.page_count < 1:
            raise ValueError("Empty PDF")
        images = []
        for page_num in range(doc.page_count):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(dpi=SLIP_PDF_DPI, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
        doc.close()
        return images

    # ไฟล์รูปภาพ = 1 หน้า
    try:
        img = Image.open(io.BytesIO(content))
        # รองรับ EXIF orientation (กรณีถ่ายแล้วกล้องบันทึกทิศทางผิด)
        img = ImageOps.exif_transpose(img)
        return [img.convert("RGB")]
    except Exception as e:
        raise ValueError(f"Unsupported file type: {filename}") from e


def _pdf_has_text_layer(content: bytes) -> bool:
    """ตรวจเร็วๆ ว่า PDF มี text layer หรือไม่"""
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages[:3]:
                txt = (page.extract_text() or "").strip()
                if txt:
                    return True
        return False
    except Exception:
        return False


def _pdf_texts_from_bytes(content: bytes) -> list[str]:
    texts = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            txt = (page.extract_text() or "").strip()
            texts.append(txt)
    return texts


def _ocrmypdf_add_text_layer(content: bytes, lang: str = "eng") -> tuple[bytes | None, list[str]]:
    """
    แปลง PDF สแกน -> searchable PDF ด้วย OCRmyPDF (eng only)
    คืน (converted_pdf_bytes_or_none, page_texts)
    """
    # ใช้ python -m ocrmypdf ก่อน (ไม่ต้องพึ่ง PATH ของ ocrmypdf.exe)
    ocrmypdf_cmd = [sys.executable, "-m", "ocrmypdf"]
    can_run = True
    try:
        probe = subprocess.run(
            ocrmypdf_cmd + ["--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if probe.returncode != 0:
            can_run = False
    except Exception:
        can_run = False
    if not can_run and shutil.which("ocrmypdf") is None:
        print("⚠ OCRmyPDF not available; skip text-layer conversion.")
        return None, []
    if not can_run:
        ocrmypdf_cmd = ["ocrmypdf"]

    tmp_dir = tempfile.mkdtemp(prefix="fuelverify_ocrmypdf_")
    try:
        in_pdf = os.path.join(tmp_dir, "input.pdf")
        out_pdf = os.path.join(tmp_dir, "output_textlayer.pdf")
        sidecar = os.path.join(tmp_dir, "sidecar.txt")
        with open(in_pdf, "wb") as f:
            f.write(content)

        cmd = ocrmypdf_cmd + [
            "--skip-text",
            "--optimize",
            "0",
            "-l",
            lang,
            "--sidecar",
            sidecar,
            in_pdf,
            out_pdf,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            print(f"⚠ OCRmyPDF failed ({proc.returncode}).")
            if proc.stderr:
                print(f"OCRmyPDF stderr: {proc.stderr[:1500]}")
            return None, []

        with open(out_pdf, "rb") as f:
            out_bytes = f.read()
        page_texts = _pdf_texts_from_bytes(out_bytes)

        # debug: โชว์ข้อความที่ได้จาก text-layer ต่อหน้า (ตัดให้สั้น)
        print("=== OCRmyPDF text-layer debug (eng only) ===")
        for i, txt in enumerate(page_texts, start=1):
            compact = re.sub(r"\s+", " ", (txt or "")).strip()
            if len(compact) > 220:
                compact = compact[:220] + " ..."
            print(f"[page {i}] {compact if compact else '(empty)'}")
        print("=== end OCRmyPDF text-layer debug ===")

        return out_bytes, page_texts
    except Exception as e:
        print(f"OCRmyPDF conversion error: {e}")
        return None, []
    finally:
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


def _ilovepdf_add_text_layer(content: bytes, filename: str = "input.pdf", lang: str = "eng") -> tuple[bytes | None, list[str]]:
    """
    แปลง PDF ด้วย iLovePDF API (pdfocr) เพื่อเพิ่ม text layer
    คืน (converted_pdf_bytes_or_none, page_texts)
    """
    if not ILOVEPDF_PUBLIC_KEY:
        print("⚠ iLovePDF: missing ILOVEPDF_PUBLIC_KEY.")
        return None, []

    token = None
    try:
        auth_resp = requests.post(
            "https://api.ilovepdf.com/v1/auth",
            data={"public_key": ILOVEPDF_PUBLIC_KEY},
            timeout=ILOVEPDF_TIMEOUT_SEC,
        )
        auth_resp.raise_for_status()
        token = (auth_resp.json() or {}).get("token")
    except Exception as e:
        print(f"⚠ iLovePDF auth failed: {e}")
        return None, []

    if not token:
        print("⚠ iLovePDF auth failed: token missing.")
        return None, []

    headers = {"Authorization": f"Bearer {token}"}
    try:
        start_url = f"https://api.ilovepdf.com/v1/start/pdfocr/{ILOVEPDF_REGION}"
        start_resp = requests.get(start_url, headers=headers, timeout=ILOVEPDF_TIMEOUT_SEC)
        if start_resp.status_code >= 400:
            # บาง endpoint อนุญาต POST
            start_resp = requests.post(start_url, headers=headers, timeout=ILOVEPDF_TIMEOUT_SEC)
        start_resp.raise_for_status()
        start_json = start_resp.json() or {}
        server = start_json.get("server")
        task = start_json.get("task")
        if not server or not task:
            print("⚠ iLovePDF start failed: missing server/task.")
            return None, []

        upload_resp = requests.post(
            f"https://{server}/v1/upload",
            headers=headers,
            data={"task": task},
            files={"file": (filename, content, "application/pdf")},
            timeout=ILOVEPDF_TIMEOUT_SEC,
        )
        upload_resp.raise_for_status()
        uploaded = upload_resp.json() or {}
        server_filename = uploaded.get("server_filename")
        if not server_filename:
            print("⚠ iLovePDF upload failed: server_filename missing.")
            return None, []

        process_payload = {
            "task": task,
            "tool": "pdfocr",
            "files": [{"server_filename": server_filename, "filename": filename}],
            "ocr_languages": [lang],
        }
        process_resp = requests.post(
            f"https://{server}/v1/process",
            headers={**headers, "Content-Type": "application/json"},
            json=process_payload,
            timeout=ILOVEPDF_TIMEOUT_SEC,
        )
        process_resp.raise_for_status()

        download_resp = requests.get(
            f"https://{server}/v1/download/{task}",
            headers=headers,
            timeout=ILOVEPDF_TIMEOUT_SEC,
        )
        download_resp.raise_for_status()
        out_bytes = download_resp.content
        ctype = (download_resp.headers.get("Content-Type") or "").lower()
        # บางเคสได้ zip กลับมา
        if "zip" in ctype or out_bytes[:4] == b"PK\x03\x04":
            with zipfile.ZipFile(io.BytesIO(out_bytes)) as zf:
                pdf_names = [n for n in zf.namelist() if n.lower().endswith(".pdf")]
                if not pdf_names:
                    print("⚠ iLovePDF download zip has no PDF.")
                    return None, []
                out_bytes = zf.read(pdf_names[0])

        page_texts = _pdf_texts_from_bytes(out_bytes)
        print("=== iLovePDF text-layer debug (eng only) ===")
        for i, txt in enumerate(page_texts, start=1):
            compact = re.sub(r"\s+", " ", (txt or "")).strip()
            if len(compact) > 220:
                compact = compact[:220] + " ..."
            print(f"[page {i}] {compact if compact else '(empty)'}")
        print("=== end iLovePDF text-layer debug ===")
        return out_bytes, page_texts
    except Exception as e:
        print(f"⚠ iLovePDF convert failed: {e}")
        return None, []


def _build_textlayer_texts_from_images(images: list[Image.Image]) -> list[str]:
    """
    สร้าง OCR text ต่อหน้า (เสมือน text layer) จากภาพ PDF สแกน
    เพื่อใช้เป็นข้อมูลตั้งต้นก่อน Typhoon
    """
    texts = []
    for img in images:
        try:
            gray = ImageOps.autocontrast(img.convert("L"))
            w, h = gray.size
            if w < 1200:
                scale = 1200.0 / w
                try:
                    resample = Image.Resampling.LANCZOS
                except AttributeError:
                    resample = Image.LANCZOS
                gray = gray.resize((int(w * scale), int(h * scale)), resample)

            raw = ""
            try:
                raw = (pytesseract.image_to_string(gray, lang="eng", config="--psm 6") or "").strip()
            except Exception:
                raw = ""
            if not raw:
                try:
                    raw = (pytesseract.image_to_string(gray, lang="eng+tha", config="--psm 6") or "").strip()
                except Exception:
                    raw = ""
            texts.append(raw)
        except Exception:
            texts.append("")
    return texts


def _card_hint_from_filename(filename: str) -> str:
    m = re.search(r"\bVIP\s*([0-9]+)\b", (filename or ""), re.IGNORECASE)
    if m:
        return f"VIP{m.group(1)}"
    return "UNKNOWN"


def _print_page_debug(page_no: int, values: dict, card_hint: str):
    v = values or {}
    amount = v.get("amount")
    amount_text = f"TOTAL THB {amount}" if amount else "-"
    print(f"Page:{page_no}")
    print(f"Merchant:{v.get('merchant') or '-'}")
    print(f"Date:{v.get('date') or '-'}")
    print(f"Last4:{v.get('last4') or '-'}")
    print(f"Amount:{amount_text}")
    print(f"Card:{card_hint}")


def _tesseract_slip_supplement(img: Image.Image) -> tuple:
    """
    อ่านสลิปด้วย Tesseract แบบหลายมุม/หลายโหมด แล้วเลือกผลที่ดีที่สุด
    คืน (raw_text, parsed_dict)
    """
    try:
        gray = img.convert("L")
        gray = ImageOps.autocontrast(gray)
        w, h = gray.size
        if w < 1100:
            scale = 1100.0 / w
            try:
                resample = Image.Resampling.LANCZOS
            except AttributeError:
                resample = Image.LANCZOS
            gray = gray.resize((int(w * scale), int(h * scale)), resample)
        best_raw = ""
        best_parsed = {}
        best_score = -1

        def _run_pass(pass_name: str, lang: str, config: str):
            nonlocal best_raw, best_parsed, best_score
            for angle in (0, 90, 180, 270):
                variant = gray if angle == 0 else gray.rotate(angle, expand=True)
                try:
                    raw = (pytesseract.image_to_string(variant, lang=lang, config=config) or "").strip()
                except Exception:
                    raw = ""
                if not raw:
                    continue
                parsed = _parse_slip_text(raw)
                score = _slip_data_score(parsed)
                if score > best_score:
                    best_raw = raw
                    best_parsed = parsed
                    best_score = score
                    print(
                        f"✅ Tesseract best updated: pass={pass_name} angle={angle}° "
                        f"score={score}, values={best_parsed}"
                    )
                if score >= 15:
                    return

        # pass 1: เร็วสุดก่อน
        _run_pass("eng-psm6", "eng", "--psm 6")
        # pass 2: ถ้ายังอ่อน ค่อยเปิดไทย
        if best_score < 12:
            _run_pass("eng+tha-psm6", "eng+tha", "--psm 6")
        # pass 3: ถ้ายังอ่อนอีก ลองโหมด sparse text
        if best_score < 10:
            _run_pass("eng+tha-psm11", "eng+tha", "--psm 11")

        if not best_raw:
            return "", {}
        return best_raw, best_parsed
    except Exception as e:
        print(f"Tesseract slip supplement error: {e}")
        return "", {}


def _tesseract_slip_roi_boost(img: Image.Image) -> tuple:
    """
    OCR เฉพาะโซนสำคัญของสลิป (บรรทัดเลขบัตร/โซน TOTAL) เพื่อลดเคสอ่านทั้งภาพแล้วหลุด
    คืน (raw_text_concat, parsed_merged)
    """
    try:
        rgb = img.convert("RGB")
        w, h = rgb.size
        rois = [
            # โซนบรรทัดเลขบัตรและบรรทัดรายการ
            rgb.crop((0, int(h * 0.45), w, int(h * 0.80))),
            # โซนยอด TOTAL / AVAILABLE BALANCE ด้านล่าง
            rgb.crop((0, int(h * 0.68), w, h)),
            # โซนกว้างส่วนล่างทั้งหมด (fallback)
            rgb.crop((0, int(h * 0.40), w, h)),
        ]
        merged = {
            "merchant": None,
            "date": None,
            "time": None,
            "last4": None,
            "amount": None,
            "cardType": None,
        }
        texts = []
        for i, roi in enumerate(rois, start=1):
            raw, parsed = _tesseract_slip_supplement(roi)
            if raw:
                texts.append(raw)
            if parsed:
                for k in merged:
                    if merged[k] is None and parsed.get(k) is not None:
                        merged[k] = parsed[k]
            if merged.get("last4") and merged.get("amount"):
                break
        raw_text = "\n".join(t for t in texts if t).strip()
        return raw_text, merged
    except Exception as e:
        print(f"Tesseract ROI boost error: {e}")
        return "", {}


def _ocr_single_image(
    img: Image.Image,
    api_url: str,
    api_key: str,
    pre_ocr_text: str = "",
    breaker_state: dict | None = None,
    breaker_lock: threading.Lock | None = None,
) -> dict:
    """
    OCR รูปภาพ 1 หน้า ผ่าน Typhoon OCR API
    ถ้าอ่านไม่ครบ จะลองใหม่สูงสุด 5 ครั้ง แล้วเอาค่าดีที่สุดจากทุกรอบมารวม
    Returns: {"image": base64, "values": {...}, "highlights": {...}}
    """
    import requests

    # แปลงภาพเป็น base64 สำหรับ preview เริ่มต้น
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG", quality=85)
    img_b64 = base64.b64encode(buffered.getvalue()).decode("ascii")

    img_rgb = img.convert("RGB")
    # ทำให้คอนทราสต์ดีขึ้นก่อน OCR (ช่วยกรณีรูปจาง/แสงไม่สม่ำเสมอ)
    img_rgb = ImageOps.autocontrast(img_rgb)

    # ค่ารวมจากทุกรอบ (เอาไว้เติมช่องที่หาย)
    merged_data = {
        "merchant": None,
        "date": None,
        "time": None,
        "last4": None,
        "amount": None,
        "cardType": None,
    }

    # เก็บ "ผลรอบเดียวที่ดีที่สุด" เพื่อให้ภาพพรีวิวกับข้อมูลมาจากรอบเดียวกัน
    best_attempt_data = {
        "merchant": None,
        "date": None,
        "time": None,
        "last4": None,
        "amount": None,
        "cardType": None,
    }
    best_img_b64 = img_b64
    best_ocr_text = ""
    best_score = -1
    best_angle = 0
    pre_parsed = _parse_slip_text(pre_ocr_text) if pre_ocr_text else {}

    max_retries = max(1, min(8, SLIP_TYPHOON_MAX_RETRIES))

    def _mark_typhoon_ok():
        if breaker_state is None:
            return
        if breaker_lock:
            with breaker_lock:
                breaker_state["fail_streak"] = 0
                breaker_state["open"] = False
        else:
            breaker_state["fail_streak"] = 0
            breaker_state["open"] = False

    def _mark_typhoon_fail():
        if breaker_state is None:
            return
        if breaker_lock:
            with breaker_lock:
                breaker_state["fail_streak"] = int(breaker_state.get("fail_streak", 0)) + 1
                if breaker_state["fail_streak"] >= SLIP_TYPHOON_FAIL_STREAK_BREAKER:
                    breaker_state["open"] = True
        else:
            breaker_state["fail_streak"] = int(breaker_state.get("fail_streak", 0)) + 1
            if breaker_state["fail_streak"] >= SLIP_TYPHOON_FAIL_STREAK_BREAKER:
                breaker_state["open"] = True

    def _is_breaker_open() -> bool:
        if breaker_state is None:
            return False
        if breaker_lock:
            with breaker_lock:
                return bool(breaker_state.get("open"))
        return bool(breaker_state.get("open"))

    def _score(ai_data: dict) -> int:
        # ให้ค่าน้ำหนักกับฟิลด์สำคัญก่อน: amount/date/last4
        score = 0
        if ai_data.get("amount"):
            score += 4
        if ai_data.get("date"):
            score += 4
        if ai_data.get("last4"):
            score += 3
        if ai_data.get("cardType"):
            score += 2
        if ai_data.get("merchant"):
            score += 2
        if ai_data.get("time"):
            score += 1
        return score

    def _typhoon_ocr_text(variant: Image.Image) -> str:
        if _is_breaker_open():
            return ""
        img_bytes = io.BytesIO()
        variant.save(img_bytes, format="JPEG", quality=85)
        img_bytes.seek(0)
        headers = {"Authorization": f"Bearer {api_key}"}
        files = {"file": ("slip.jpg", img_bytes, "image/jpeg")}
        data = {"model": "typhoon-ocr"}
        response = requests.post(
            api_url,
            headers=headers,
            files=files,
            data=data,
            timeout=SLIP_TYPHOON_TIMEOUT_SEC,
        )
        if response.status_code != 200:
            print(f"Typhoon OCR API Error (status {response.status_code}): {response.text}")
            _mark_typhoon_fail()
            return ""
        response.raise_for_status()
        result_json = response.json()
        try:
            text = result_json["results"][0]["message"]["choices"][0]["message"]["content"]
            if text:
                _mark_typhoon_ok()
            else:
                _mark_typhoon_fail()
            return text
        except (KeyError, IndexError):
            if "text" in result_json:
                text = result_json["text"]
                if text:
                    _mark_typhoon_ok()
                else:
                    _mark_typhoon_fail()
                return text
            if "choices" in result_json:
                text = result_json["choices"][0]["message"]["content"]
                if text:
                    _mark_typhoon_ok()
                else:
                    _mark_typhoon_fail()
                return text
            import json
            print(
                "Typhoon OCR returned 200 but no extractable OCR text; "
                f"keys={list(result_json.keys())}"
            )
            _mark_typhoon_fail()
            return json.dumps(result_json, ensure_ascii=False)

    def _apply_typhoon_result(ocr_text: str, variant: Image.Image, used_angle: int, log_prefix: str) -> dict:
        nonlocal best_score, best_attempt_data, best_ocr_text, best_img_b64, best_angle
        ai_data = _parse_slip_text(ocr_text)
        attempt_score = _score(ai_data)
        for key in merged_data:
            if merged_data[key] is None and ai_data.get(key) is not None:
                merged_data[key] = ai_data[key]
        if attempt_score > best_score:
            best_score = attempt_score
            best_attempt_data = ai_data.copy()
            best_ocr_text = ocr_text or ""
            best_angle = used_angle
            buffered2 = io.BytesIO()
            variant.save(buffered2, format="JPEG", quality=85)
            best_img_b64 = base64.b64encode(buffered2.getvalue()).decode("ascii")
            print(
                f"✅ Best OCR updated: {log_prefix} angle={used_angle}° "
                f"score={attempt_score}, values={best_attempt_data}"
            )
        return ai_data

    variant0 = img_rgb
    # --- เฟส 1: มุม 0° + retry (ค่าเริ่ม — กันสลิปที่ถ่ายตรง) ---
    for attempt in range(1, max_retries + 1):
        if all(merged_data[k] is not None for k in merged_data):
            break
        try:
            ocr_text = _typhoon_ocr_text(variant0)
            if not ocr_text:
                continue
            if SLIP_DEBUG_VERBOSE:
                if attempt == 1:
                    print(f"=== Typhoon OCR Result ===\n{ocr_text}\n========================")
                else:
                    print(f"=== Typhoon OCR Retry {attempt} ===\n{ocr_text}\n========================")
            ai_data = _apply_typhoon_result(ocr_text, variant0, 0, f"attempt={attempt}")
            if all(ai_data.get(k) for k in ("merchant", "date", "time", "last4", "amount", "cardType")):
                break
            if all(merged_data[k] is not None for k in merged_data):
                break
        except Exception as e:
            print(f"[Attempt {attempt}] Error calling Typhoon OCR API: {e}")
            _mark_typhoon_fail()
            if _is_breaker_open():
                print("⚠ Typhoon failure streak reached breaker threshold; temporarily skipping Typhoon calls.")
                break

    def _provisional_dict() -> dict:
        d = {k: best_attempt_data.get(k) for k in best_attempt_data}
        for k in merged_data:
            if d.get(k) is None and merged_data.get(k) is not None:
                d[k] = merged_data[k]
        return d

    def _needs_rotation_fallback() -> bool:
        """สลิปเอียง/กลับหัวมักได้แค่ last4 แต่ไม่มี merchant/date/amount"""
        d = _provisional_dict()
        core = sum(1 for k in ("merchant", "date", "amount", "time") if d.get(k))
        return core < 3

    # --- เฟส 2: หมุน 90/180/270 เฉพาะเมื่ออ่านที่ 0° แล้วยังอ่อน (ไม่กระทบไฟล์ที่ถ่ายตรง) ---
    if SLIP_ROTATION_FALLBACK and _needs_rotation_fallback():
        print("↻ OCR at 0° looks weak — trying Typhoon at 90° / 180° / 270° …")
        for angle in (90, 180, 270):
            if all(merged_data[k] is not None for k in merged_data):
                break
            variant = img_rgb.rotate(angle, expand=True).convert("RGB")
            try:
                ocr_text = _typhoon_ocr_text(variant)
                if not ocr_text:
                    continue
                if SLIP_DEBUG_VERBOSE:
                    print(f"=== Typhoon OCR rotation {angle}° ===\n{ocr_text}\n========================")
                ai_data = _apply_typhoon_result(ocr_text, variant, angle, f"rotation={angle}°")
                if all(ai_data.get(k) for k in ("merchant", "date", "time", "last4", "amount", "cardType")):
                    break
                if all(merged_data[k] is not None for k in merged_data):
                    break
                # ได้ฟิลด์หลักพอใช้แล้ว ไม่ต้องลองมุมถัดไป
                d = _provisional_dict()
                if (
                    d.get("merchant")
                    and d.get("date")
                    and d.get("amount")
                    and d.get("last4")
                ):
                    break
            except Exception as e:
                print(f"[Rotation {angle}°] Error calling Typhoon OCR API: {e}")
                _mark_typhoon_fail()
                if _is_breaker_open():
                    print("⚠ Typhoon breaker is open; stopping rotation fallback early.")
                    break

    # ใช้ค่าจากรอบที่ดีที่สุดเป็นฐาน แล้วเติมช่องที่ยังว่างจาก merged_data
    final_data = best_attempt_data.copy()
    for key in final_data:
        if final_data.get(key) is None and merged_data.get(key) is not None:
            final_data[key] = merged_data[key]
    # เติมจาก OCR text layer ที่สร้างไว้ก่อน (กรณี Typhoon พลาดบางฟิลด์)
    if pre_parsed:
        for key in final_data:
            if final_data.get(key) is None and pre_parsed.get(key) is not None:
                final_data[key] = pre_parsed[key]

    tesseract_raw = ""
    if final_data.get("last4") is None or final_data.get("merchant") is None or final_data.get("amount") is None:
        # ใช้มุมเดียวกับรูปที่ Typhoon ให้คะแนนดีที่สุด (แก้สลิปเอียง)
        tess_img = (
            img_rgb
            if best_angle == 0
            else img_rgb.rotate(best_angle, expand=True).convert("RGB")
        )
        tesseract_raw, tess_parsed = _tesseract_slip_supplement(tess_img)
        if tess_parsed:
            for key in final_data:
                if key == "amount":
                    # ป้องกันเติมยอดเพี้ยนจาก OCR สำรอง (เช่นอ่าน AVAILABLE BALANCE ผิดเป็น TOTAL)
                    if (
                        final_data.get(key) is None
                        and tess_parsed.get(key)
                        and _amount_has_total_evidence(tesseract_raw, tess_parsed.get(key))
                    ):
                        final_data[key] = tess_parsed[key]
                elif final_data.get(key) is None and tess_parsed.get(key):
                    final_data[key] = tess_parsed[key]
            filled = {k: tess_parsed.get(k) for k in ("last4", "amount", "merchant") if tess_parsed.get(k)}
            if filled:
                print(f"✅ Tesseract supplement filled: {filled}")

    # OCR เฉพาะโซนสำคัญอีกชั้นสำหรับเคสที่ยังหลุด (last4/amount)
    roi_raw = ""
    if final_data.get("last4") is None or final_data.get("amount") is None:
        roi_raw, roi_parsed = _tesseract_slip_roi_boost(
            img_rgb if best_angle == 0 else img_rgb.rotate(best_angle, expand=True).convert("RGB")
        )
        if roi_parsed:
            roi_filled = {}
            for key in ("last4", "merchant"):
                if final_data.get(key) is None and roi_parsed.get(key):
                    final_data[key] = roi_parsed[key]
                    roi_filled[key] = roi_parsed[key]
            if roi_filled:
                print(f"✅ Tesseract ROI boost filled: {roi_filled}")

    # log สรุป
    missing = [k for k, v in final_data.items() if v is None]
    if missing:
        print(f"⚠ Still missing after {max_retries} attempts: {missing}")
    quality_text = (
        (best_ocr_text or "")
        + "\n"
        + (pre_ocr_text or "")
        + "\n"
        + (tesseract_raw or "")
        + "\n"
        + (roi_raw or "")
    ).strip()
    quality = _build_page_quality(quality_text, final_data)

    return {
        "image": f"data:image/jpeg;base64,{best_img_b64}",
        "values": {
            "merchant": final_data.get("merchant"),
            "date": final_data.get("date"),
            "time": final_data.get("time"),
            "last4": final_data.get("last4"),
            "amount": final_data.get("amount"),
            "cardType": final_data.get("cardType"),
        },
        "highlights": {
            "merchant": None,
            "date": None,
            "time": None,
            "last4": None,
            "amount": None,
            "cardType": None,
        },
        "quality": quality
    }


progress_store = {}

def extract_slip_preview(filename: str, content: bytes, task_id: str = None):
    api_url = (os.environ.get("TYPHOON_OCR_URL") or "https://api.opentyphoon.ai/v1/ocr").strip()
    api_key = (os.environ.get("TYPHOON_API_KEY") or os.environ.get("OPENTYPHOON_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "ยังไม่ได้ตั้งค่า Typhoon API key: ตั้งค่า TYPHOON_API_KEY ใน environment "
                "หรือสร้างไฟล์ backend/.env จาก backend/.env.example"
            ),
        )

    lower = (filename or "").lower()
    source_pdf_bytes = content
    pre_texts = []

    # PDF -> ถ้ามี text layer อยู่แล้ว ส่งเข้า Typhoon ได้เลย
    # ถ้าไม่มี text layer ค่อยแปลงก่อน OCR
    if lower.endswith(".pdf"):
        has_text_layer = _pdf_has_text_layer(content)
        should_convert = not has_text_layer
        converted_bytes, converted_texts = (None, [])
        if should_convert:
            provider = SLIP_TEXTLAYER_PROVIDER
            if provider == "auto":
                provider = "ilovepdf" if ILOVEPDF_PUBLIC_KEY else "ocrmypdf"

            if provider == "ilovepdf":
                print("↻ Converting PDF to text layer via iLovePDF API (eng) ...")
                converted_bytes, converted_texts = _ilovepdf_add_text_layer(
                    content,
                    filename=(filename or "input.pdf"),
                    lang="eng",
                )
                if not converted_bytes:
                    print("↻ iLovePDF unavailable/failed, fallback to OCRmyPDF ...")
                    converted_bytes, converted_texts = _ocrmypdf_add_text_layer(content, lang="eng")
            else:
                if has_text_layer:
                    print("↻ PDF already has text layer; re-normalizing with OCRmyPDF before Typhoon ...")
                else:
                    print("↻ PDF has no text layer; converting with OCRmyPDF (eng only) ...")
                converted_bytes, converted_texts = _ocrmypdf_add_text_layer(content, lang="eng")

        if converted_bytes:
            source_pdf_bytes = converted_bytes
            pre_texts = converted_texts
        else:
            if has_text_layer:
                print("✓ PDF already has text layer; sending directly to Typhoon.")
            else:
                print("↻ Text-layer conversion unavailable/failed, fallback to Tesseract text hints.")

    # ดึงรูปภาพจากไฟล์ที่จะใช้วิเคราะห์
    images = _images_from_upload_bytes(filename, source_pdf_bytes if lower.endswith(".pdf") else content)
    total_pages = len(images)

    if not pre_texts:
        pre_texts = [""] * total_pages
        if lower.endswith(".pdf") and total_pages > 0 and not _pdf_has_text_layer(source_pdf_bytes):
            pre_texts = _build_textlayer_texts_from_images(images)
    if len(pre_texts) < total_pages:
        pre_texts += [""] * (total_pages - len(pre_texts))

    if task_id:
        progress_store[task_id] = {"current": 0, "total": total_pages}

    workers = max(1, min(SLIP_OCR_WORKERS, total_pages, 8))
    typhoon_breaker = {"fail_streak": 0, "open": False}
    typhoon_breaker_lock = threading.Lock()
    card_hint = _card_hint_from_filename(filename)

    def _run_page(idx: int, page_img):
        print(f"--- Processing page {idx + 1}/{total_pages} (workers={workers}) ---")
        return idx, _ocr_single_image(
            page_img,
            api_url,
            api_key,
            pre_ocr_text=pre_texts[idx] if idx < len(pre_texts) else "",
            breaker_state=typhoon_breaker,
            breaker_lock=typhoon_breaker_lock,
        )

    pages = [None] * total_pages
    if workers == 1:
        for i, img in enumerate(images):
            if task_id:
                progress_store[task_id] = {"current": i + 1, "total": total_pages}
            _, pr = _run_page(i, img)
            pages[i] = pr
            _print_page_debug(i + 1, pr.get("values"), card_hint)
    else:
        done = 0
        with ThreadPoolExecutor(max_workers=workers) as pool:
            future_map = {pool.submit(_run_page, i, img): i for i, img in enumerate(images)}
            for fut in as_completed(future_map):
                idx, page_result = fut.result()
                pages[idx] = page_result
                _print_page_debug(idx + 1, page_result.get("values"), card_hint)
                done += 1
                if task_id:
                    progress_store[task_id] = {"current": done, "total": total_pages}

    # Cross-page fill: เติม last4 จากหน้าอื่น
    all_last4 = [p["values"].get("last4") for p in pages if p["values"].get("last4")]
    if all_last4:
        unique_last4 = set(all_last4)
        if len(unique_last4) == 1:
            common_last4 = list(unique_last4)[0]
            for p in pages:
                if p["values"].get("last4") is None:
                    p["values"]["last4"] = common_last4
                    print(f"✅ Filled missing last4 with {common_last4} from other pages (Single card file)")
        else:
            print(f"⚠️ Multiple different cards detected {unique_last4}. Applying safe proximity autofill.")
            for i, p in enumerate(pages):
                if p["values"].get("last4") is None:
                    # หาบัตรหน้าก่อนหน้านี้
                    prev_last4 = None
                    prev_dist = None
                    for j in range(i - 1, -1, -1):
                        if pages[j]["values"].get("last4") is not None:
                            prev_last4 = pages[j]["values"]["last4"]
                            prev_dist = i - j
                            break
                    
                    # หาบัตรหน้าท้ายสุด
                    next_last4 = None
                    next_dist = None
                    for j in range(i + 1, len(pages)):
                        if pages[j]["values"].get("last4") is not None:
                            next_last4 = pages[j]["values"]["last4"]
                            next_dist = j - i
                            break

                    chosen_last4 = None
                    # ปลอดภัยสุด: ถ้าหน้าข้างๆ ทั้งสองด้านเห็นค่าเดียวกัน ค่อยเติม
                    if prev_last4 and next_last4 and prev_last4 == next_last4:
                        chosen_last4 = prev_last4
                    # ถ้ามีด้านเดียว เติมเฉพาะกรณีอยู่ใกล้มาก (ติดกัน 1 หน้า) เพื่อลดปนข้ามบัตร
                    elif prev_last4 and not next_last4 and prev_dist == 1:
                        chosen_last4 = prev_last4
                    elif next_last4 and not prev_last4 and next_dist == 1:
                        chosen_last4 = next_last4

                    if chosen_last4:
                        p["values"]["last4"] = chosen_last4
                        print(f"✅ Filled missing last4 on page {i+1} with {chosen_last4} (Safe proximity fill)")
                    else:
                        print(f"↷ Skip autofill last4 on page {i+1} (ambiguous multi-card context)")

    if task_id and task_id in progress_store:
        del progress_store[task_id]

    return {
        "total_pages": total_pages,
        "pages": pages
    }



@app.post("/upload")
def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    try:
        content = file.file.read()
        extracted_data = extract_kasikorn_ocr(content)
        return {
            "filename": file.filename,
            "count": len(extracted_data),
            "data": extracted_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/upload-slip-progress")
def get_slip_progress(task_id: str):
    data = progress_store.get(task_id)
    if not data:
        return {"current": 0, "total": 0}
    return data

@app.post("/upload-slip")
def upload_slip(file: UploadFile = File(...), task_id: str = None):
    lower = (file.filename or "").lower()
    if not (lower.endswith(".pdf") or lower.endswith(".png") or lower.endswith(".jpg") or lower.endswith(".jpeg") or lower.endswith(".webp")):
        raise HTTPException(status_code=400, detail="Only PDF or image files are supported.")

    try:
        content = file.file.read()
        extracted = extract_slip_preview(file.filename, content, task_id)
        return {"filename": file.filename, **extracted}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn

    _port = int(os.environ.get("PORT", "5004"))
    _host = os.environ.get("HOST", "127.0.0.1")

    # API สำหรับจัดการข้อมูลถาวร (SQLite)
    @app.get("/api/records")
    def get_records():
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT id, name, date, type, data, created_at FROM records ORDER BY created_at DESC")
        rows = c.fetchall()
        
        results = []
        for r in rows:
            record_data = json.loads(r["data"])
            # รวม metadata พื้นฐาน
            results.append({
                **record_data,
                "created_at": r["created_at"]
            })
        conn.close()
        return results

    @app.get("/api/records/{id}")
    def get_record_detail(id: str):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # ดึง Metadata
        c.execute("SELECT data FROM records WHERE id = ?", (id,))
        r = c.fetchone()
        if not r:
            conn.close()
            raise HTTPException(status_code=404, detail="Record not found")
        
        record = json.loads(r["data"])
        
        # ดึงรูปสลิปและผล OCR เต็ม
        c.execute("SELECT data FROM slip_blobs WHERE id = ?", (id,))
        sb = c.fetchone()
        if sb:
            record["slipResult"] = json.loads(sb["data"])
            
        conn.close()
        return record

    @app.post("/api/records")
    async def save_record(record: dict):
        record_id = record.get("id")
        if not record_id:
            raise HTTPException(status_code=400, detail="Missing record id")
        
        # แยก slipResult ออกไปเก็บใน blobs เพื่อไม่ให้ไฟล์ข้อมูลหลักใหญ่เกินไป
        full_slip_result = record.pop("slipResult", None)
        
        name = record.get("name", "รายการใหม่")
        date = record.get("date", "")
        type_ = record.get("type", "manual")
        data_json = json.dumps(record)
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Save Metadata
        c.execute("INSERT OR REPLACE INTO records (id, name, date, type, data) VALUES (?, ?, ?, ?, ?)",
                  (record_id, name, date, type_, data_json))
        
        # Save Slip Blobs (ถ้ามี)
        if full_slip_result:
            c.execute("INSERT OR REPLACE INTO slip_blobs (id, data) VALUES (?, ?)",
                      (record_id, json.dumps(full_slip_result)))
        
        conn.commit()
        conn.close()
        return {"status": "success", "id": record_id}

    @app.delete("/api/records/{id}")
    def delete_record(id: str):
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM records WHERE id = ?", (id,))
        c.execute("DELETE FROM slip_blobs WHERE id = ?", (id,))
        conn.commit()
        conn.close()
        return {"status": "deleted"}

    uvicorn.run(app, host=_host, port=_port)
