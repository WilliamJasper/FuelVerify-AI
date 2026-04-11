import os

file_path = 'c:/Users/Asus/Downloads/เอกสหกรุ๊ป/FuelVerify-AI/backend/main.py'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_mode = False

# We want to keep everything from start to the first corruption point.
# Corruption point 1: line 1553 in broken version
# Corruption point 2: line 1629 in broken version
# Corruption point 3: line 1771 in broken version

# I'll rebuild the file by searching for the functions I know are correct.
# 1. Start to 'def extract_slip_preview'
# 2. Correct 'extract_slip_preview' (I'll provide full text)
# 3. Correct 'upload_pdf' (I'll provide full text)
# 4. Correct 'extract_bbl_ocr' (I'll provide full text)
# 5. Remaining functions (extract_kasikorn_ocr etc. are already at the top)

# Wait, some functions are BELOW extract_bbl_ocr? Like 'extract_kasikorn_ocr'? No, it's at line 110.
# What is BELOW extract_bbl_ocr? Let's check.

# I'll just find where the corruption starts.
# It seems it starts after 'quality = _build_page_quality(quality_text, final_data)'.

marker = 'quality = _build_page_quality(quality_text, final_data)'
found_marker = -1
for i, line in enumerate(lines):
    if marker in line:
        found_marker = i
        break

if found_marker == -1:
    print("Marker not found")
    # Try another marker
    marker = 'def _ocr_single_image'
    for i, line in enumerate(lines):
        if marker in line:
            found_marker = i
            break

if found_marker == -1:
    print("CRITICAL: Marker not found")
    exit(1)

# Keep everything up to found_marker + 2 (the return statement)
# Actually _ocr_single_image ends with:
#     return {
#         "image": f"data:image/jpeg;base64,{best_img_b64}",
#         ...
#         "quality": quality
#     }

final_lines = []
for i in range(found_marker + 1):
    final_lines.append(lines[i])

# Now append the rest of the functions correctly.
# I will provide the FULL content of the remaining file parts here.

final_lines.extend([
'    return {\n',
'        "image": f"data:image/jpeg;base64,{best_img_b64}",\n',
'        "values": {\n',
'            "merchant": final_data.get("merchant"),\n',
'            "date": final_data.get("date"),\n',
'            "time": final_data.get("time"),\n',
'            "last4": final_data.get("last4"),\n',
'            "amount": final_data.get("amount"),\n',
'            "cardType": final_data.get("cardType"),\n',
'        },\n',
'        "highlights": {\n',
'            "merchant": None,\n',
'            "date": None,\n',
'            "time": None,\n',
'            "last4": None,\n',
'            "amount": None,\n',
'            "cardType": None,\n',
'        },\n',
'        "quality": quality\n',
'    }\n',
'\n',
'\n',
'progress_store = {}\n',
'\n',
'def extract_slip_preview(filename: str, content: bytes, task_id: str = None):\n',
'    api_url = (os.environ.get("TYPHOON_OCR_URL") or "https://api.opentyphoon.ai/v1/ocr").strip()\n',
'    api_key = (os.environ.get("TYPHOON_API_KEY") or os.environ.get("OPENTYPHOON_API_KEY") or "").strip()\n',
'    if not api_key:\n',
'        raise HTTPException(\n',
'            status_code=503,\n',
'            detail=(\n',
'                "ยังไม่ได้ตั้งค่า Typhoon API key: ตั้งค่า TYPHOON_API_KEY ใน environment "\n',
'                "หรือสร้างไฟล์ backend/.env จาก backend/.env.example"\n',
'            ),\n',
'        )\n',
'\n',
'    lower = (filename or "").lower()\n',
'    source_pdf_bytes = content\n',
'    pre_texts = []\n',
'\n',
'    if lower.endswith(".pdf"):\n',
'        has_text_layer = _pdf_has_text_layer(content)\n',
'        should_convert = not has_text_layer\n',
'        converted_bytes, converted_texts = (None, [])\n',
'        if should_convert:\n',
'            provider = SLIP_TEXTLAYER_PROVIDER\n',
'            if provider == "auto":\n',
'                provider = "ilovepdf" if ILOVEPDF_PUBLIC_KEY else "ocrmypdf"\n',
'\n',
'            if provider == "ilovepdf":\n',
'                print("↻ Converting PDF to text layer via iLovePDF API (eng) ...")\n',
'                converted_bytes, converted_texts = _ilovepdf_add_text_layer(\n',
'                    content,\n',
'                    filename=(filename or "input.pdf"),\n',
'                    lang="eng",\n',
'                )\n',
'                if not converted_bytes:\n',
'                    print("↻ iLovePDF unavailable/failed, fallback to OCRmyPDF ...")\n',
'                    converted_bytes, converted_texts = _ocrmypdf_add_text_layer(content, lang="eng")\n',
'            else:\n',
'                if has_text_layer:\n',
'                    print("↻ PDF already has text layer; re-normalizing with OCRmyPDF before Typhoon ...")\n',
'                else:\n',
'                    print("↻ PDF has no text layer; converting with OCRmyPDF (eng only) ...")\n',
'                converted_bytes, converted_texts = _ocrmypdf_add_text_layer(content, lang="eng")\n',
'\n',
'        if converted_bytes:\n',
'            source_pdf_bytes = converted_bytes\n',
'            pre_texts = converted_texts\n',
'        else:\n',
'            if has_text_layer:\n',
'                print("✓ PDF already has text layer; sending directly to Typhoon.")\n',
'            else:\n',
'                print("↻ Text-layer conversion unavailable/failed, fallback to Tesseract text hints.")\n',
'\n',
'    images = _images_from_upload_bytes(filename, source_pdf_bytes if lower.endswith(".pdf") else content)\n',
'    total_pages = len(images)\n',
'\n',
'    if not pre_texts:\n',
'        pre_texts = [""] * total_pages\n',
'        if lower.endswith(".pdf") and total_pages > 0 and not _pdf_has_text_layer(source_pdf_bytes):\n',
'            pre_texts = _build_textlayer_texts_from_images(images)\n',
'    if len(pre_texts) < total_pages:\n',
'        pre_texts += [""] * (total_pages - len(pre_texts))\n',
'\n',
'    if task_id:\n',
'        progress_store[task_id] = {"current": 0, "total": total_pages}\n',
'\n',
'    workers = max(1, min(SLIP_OCR_WORKERS, total_pages, 8))\n',
'    typhoon_breaker = {"fail_streak": 0, "open": False}\n',
'    typhoon_breaker_lock = threading.Lock()\n',
'    card_hint = _card_hint_from_filename(filename)\n',
'\n',
'    def _run_page(idx: int, page_img):\n',
'        print(f"--- Processing page {idx + 1}/{total_pages} (workers={workers}) ---")\n',
'        return idx, _ocr_single_image(\n',
'            page_img,\n',
'            api_url,\n',
'            api_key,\n',
'            pre_ocr_text=pre_texts[idx] if idx < len(pre_texts) else "",\n',
'            breaker_state=typhoon_breaker,\n',
'            breaker_lock=typhoon_breaker_lock,\n',
'        )\n',
'\n',
'    pages = [None] * total_pages\n',
'    if workers == 1:\n',
'        for i, img in enumerate(images):\n',
'            if task_id:\n',
'                progress_store[task_id] = {"current": i + 1, "total": total_pages}\n',
'            _, pr = _run_page(i, img)\n',
'            pages[i] = pr\n',
'            _print_page_debug(i + 1, pr.get("values"), card_hint)\n',
'    else:\n',
'        done = 0\n',
'        with ThreadPoolExecutor(max_workers=workers) as pool:\n',
'            future_map = {pool.submit(_run_page, i, img): i for i, img in enumerate(images)}\n',
'            for fut in as_completed(future_map):\n',
'                idx, page_result = fut.result()\n',
'                pages[idx] = page_result\n',
'                _print_page_debug(idx + 1, page_result.get("values"), card_hint)\n',
'                done += 1\n',
'                if task_id:\n',
'                    progress_store[task_id] = {"current": done, "total": total_pages}\n',
'\n',
'    all_last4 = [p["values"].get("last4") for p in pages if p["values"].get("last4")]\n',
'    if all_last4:\n',
'        unique_last4 = set(all_last4)\n',
'        if len(unique_last4) == 1:\n',
'            common_last4 = list(unique_last4)[0]\n',
'            for p in pages:\n',
'                if p["values"].get("last4") is None:\n',
'                    p["values"]["last4"] = common_last4\n',
'                    print(f"✅ Filled missing last4 with {common_last4} from other pages (Single card file)")\n',
'        else:\n',
'            print(f"⚠️ Multiple different cards detected {unique_last4}. Applying safe proximity autofill.")\n',
'            for i, p in enumerate(pages):\n',
'                if p["values"].get("last4") is None:\n',
'                    prev_last4 = None\n',
'                    prev_dist = None\n',
'                    for j in range(i - 1, -1, -1):\n',
'                        if pages[j]["values"].get("last4") is not None:\n',
'                            prev_last4 = pages[j]["values"]["last4"]\n',
'                            prev_dist = i - j\n',
'                            break\n',
'                    next_last4 = None\n',
'                    next_dist = None\n',
'                    for j in range(i + 1, len(pages)):\n',
'                        if pages[j]["values"].get("last4") is not None:\n',
'                            next_last4 = pages[j]["values"]["last4"]\n',
'                            next_dist = j - i\n',
'                            break\n',
'                    chosen_last4 = None\n',
'                    if prev_last4 and next_last4 and prev_last4 == next_last4:\n',
'                        chosen_last4 = prev_last4\n',
'                    elif prev_last4 and not next_last4 and prev_dist == 1:\n',
'                        chosen_last4 = prev_last4\n',
'                    elif next_last4 and not prev_last4 and next_dist == 1:\n',
'                        chosen_last4 = next_last4\n',
'                    if chosen_last4:\n',
'                        p["values"]["last4"] = chosen_last4\n',
'                        print(f"✅ Filled missing last4 on page {i+1} with {chosen_last4} (Safe proximity fill)")\n',
'                    else:\n',
'                        print(f"↷ Skip autofill last4 on page {i+1} (ambiguous multi-card context)")\n',
'\n',
'    if task_id and task_id in progress_store:\n',
'        del progress_store[task_id]\n',
'\n',
'    return {\n',
'        "total_pages": total_pages,\n',
'        "pages": pages\n',
'    }\n',
'\n',
'\n',
'@app.post("/upload")\n',
'def upload_pdf(files: List[UploadFile] = File(...)):\n',
'    for f in files:\n',
'        if not (f.filename or "").lower().endswith(".pdf"):\n',
'            raise HTTPException(status_code=400, detail=f"Only PDF files are supported. File \'{f.filename}\' is invalid.")\n',
'    try:\n',
'        bbl_merged_data = {}\n',
'        bbl_summary = {"previous_balance": "0.00", "current_total": "0.00"}\n',
'        kbank_data = []\n',
'        for f in files:\n',
'            content = f.file.read()\n',
'            f.file.seek(0)\n',
'            text_preview = ""\n',
'            with pdfplumber.open(io.BytesIO(content)) as pdf:\n',
'                for p_idx in range(min(2, len(pdf.pages))):\n',
'                    text_preview += (pdf.pages[p_idx].extract_text() or "")\n',
'            is_bbl = "BANGKOK BANK" in text_preview.upper() or "ธนาคารกรุงเทพ" in text_preview\n',
'            if is_bbl:\n',
'                res_obj = extract_bbl_ocr(content)\n',
'                res = res_obj.get("data", [])\n',
'                s = res_obj.get("summary", {})\n',
'                if s.get("previous_balance") and s.get("previous_balance") != "0.00":\n',
'                    bbl_summary["previous_balance"] = s["previous_balance"]\n',
'                if s.get("current_total") and s.get("current_total") != "0.00":\n',
'                    bbl_summary["current_total"] = s["current_total"]\n',
'                for card in res:\n',
'                    cid = card.get("card_id")\n',
'                    if cid not in bbl_merged_data:\n',
'                        bbl_merged_data[cid] = card\n',
'                    else:\n',
'                        existing = bbl_merged_data[cid]\n',
'                        if card.get("transactions"):\n',
'                            existing["transactions"].extend(card["transactions"])\n',
'                            existing["transaction_count"] = len(existing["transactions"])\n',
'                        if card.get("balance") and card.get("balance") != "0.00":\n',
'                            existing["balance"] = card["balance"]\n',
'                        if card.get("credit_limit") and card.get("credit_limit") != "0.00":\n',
'                            existing["credit_limit"] = card["credit_limit"]\n',
'                        if card.get("account_name") and "CARD" in card.get("account_name").upper():\n',
'                            existing["account_name"] = card["account_name"]\n',
'            else:\n',
'                res = extract_kasikorn_ocr(content)\n',
'                kbank_data.extend(res)\n',
'        final_data = []\n',
'        if bbl_merged_data:\n',
'            sorted_bbl = sorted(bbl_merged_data.values(), key=lambda x: str(x.get("card_id", "")))\n',
'            final_data.extend(sorted_bbl)\n',
'        if kbank_data:\n',
'            final_data.extend(kbank_data)\n',
'        return {"filename": ", ".join([f.filename for f in files]), "count": len(final_data), "data": final_data, "summary": bbl_summary if bbl_merged_data else None}\n',
'    except Exception as e:\n',
'        import traceback\n',
'        traceback.print_exc()\n',
'        raise HTTPException(status_code=500, detail=str(e))\n',
'\n',
'\n',
'def extract_bbl_ocr(pdf_bytes):\n',
'    data_rows = []\n',
'    card_map = {}\n',
'    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:\n',
'        all_text = ""\n',
'        for page in pdf.pages:\n',
'            all_text += (page.extract_text() or "") + "\\n---PAGE_BREAK---\\n"\n',
'        num_pattern = r\'([\\d,]+\\s*\\.\\s*\\d{2})\'\n',
'        global_prev_bal = "0.00"\n',
'        global_curr_total = "0.00"\n',
'        prev_bal_search = re.search(num_pattern + r\'[\\s\\S]{0,40}Previous Balance\', all_text, re.IGNORECASE)\n',
'        if prev_bal_search: global_prev_bal = re.sub(r\'\\s+\', \'\', prev_bal_search.group(1))\n',
'        curr_total_search = re.search(r\'Total\\s+[\\d,.\\s]+\\s+\' + num_pattern + r\'\\s+-\\s+\' + num_pattern, all_text, re.IGNORECASE)\n',
'        if curr_total_search: global_curr_total = re.sub(r\'\\s+\', \'\', curr_total_search.group(2))\n',
'        else:\n',
'            curr_vals = re.findall(num_pattern + r\'\\s+.{1,10}\\s+\' + num_pattern + r\'\\s+.{1,10}\', all_text)\n',
'            if curr_vals: global_curr_total = re.sub(r\'\\s+\', \'\', curr_vals[0][1])\n',
'        for line in all_text.split(\'\\n\'):\n',
'            m = re.search(r\'(\\d{4}\\s+00xx\\s+xxxx\\s+(\\d{4}))[^\\n]*?\\s+([\\d,]+\\s*\\.?\\s*\\d*)\\s+Baht[^\\n]*?([\\d,]+\\s*\\.\\s*\\d{2})\', line)\n',
'            if m:\n',
'                card_no, card_id, limit, balance = m.group(1), m.group(2), re.sub(r\'\\s+\', \'\', m.group(3)), m.group(4)\n',
'                if card_id not in card_map:\n',
'                    data_rows.append({"card_no": card_no, "card_id": card_id, "account_name": f"CARD {card_id}", "credit_limit": limit, "balance": balance, "min_payment": "0.00", "previous_balance": "0.00", "total_balance_calc": balance, "transaction_count": 0, "transactions": []})\n',
'                    card_map[card_id] = len(data_rows) - 1\n',
'        sections = re.split(r\'Account\\s+Details|รายละเอียดรายการใช้จ่าย\', all_text, flags=re.IGNORECASE)\n',
'        for section in sections[1:]:\n',
'            card_head_match = re.search(r\'หมายเลขบัตร\\s+([\\d\\sXx]+)\', section)\n',
'            if not card_head_match: continue\n',
'            raw_card_no = card_head_match.group(1).strip()\n',
'            clean_digits = re.sub(r\'[^\\d]+\', \'\', raw_card_no)\n',
'            card_id = clean_digits[-4:] if len(clean_digits) >= 4 else "0000"\n',
'            if card_id not in card_map:\n',
'                data_rows.append({"card_no": raw_card_no, "card_id": card_id, "account_name": f"CARD {card_id}", "credit_limit": "0.00", "balance": "0.00", "min_payment": "0.00", "previous_balance": "0.00", "total_balance_calc": "0.00", "transaction_count": 0, "transactions": []})\n',
'                card_map[card_id] = len(data_rows) - 1\n',
'            target_idx = card_map[card_id]\n',
'            limit_m = re.search(r\'วงเงิน\\s+([\\d,]+)\', section)\n',
'            if limit_m: data_rows[target_idx]["credit_limit"] = limit_m.group(1).replace(\',\', \'\')\n',
'            txn_lines = section.split(\'\\n\')\n',
'            for i, line in enumerate(txn_lines):\n',
'                line = line.strip()\n',
'                m = re.search(r\'(\\d{2}/\\d{2}/\\d{4})\\s+(\\d{2}:\\d{2})\\s+(\\d{2}/\\d{2}/\\d{4})\\s+(\\d+)\\s+(.*?)\\s+(\\d+)\\s+(.*?)\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\', line)\n',
'                if m:\n',
'                    date, time, post_date, main_desc, product, amount = m.group(1), m.group(2), m.group(3), m.group(5).strip(), m.group(7).strip(), m.group(10)\n',
'                    sub_desc = []\n',
'                    branch = ""\n',
'                    for j in range(1, 4):\n',
'                        if i+j < len(txn_lines):\n',
'                            nl = txn_lines[i+j].strip()\n',
'                            if re.match(r\'\\d{2}/\\d{2}/\\d{4}\', nl) or "ยอดเงินรวม" in nl or "PAYMENT" in nl: break\n',
'                            sub_desc.append(nl)\n',
'                    if sub_desc: branch = sub_desc[-1]; full_desc = " ".join([main_desc] + sub_desc[:-1]) if len(sub_desc) > 1 else main_desc\n',
'                    else: full_desc = main_desc\n',
'                    data_rows[target_idx]["transactions"].append({"date": date, "post_date": post_date, "desc": full_desc.strip(), "branch": branch.strip(), "type": product, "amount": amount})\n',
'                pmt_m = re.search(r\'(\\d{2}/\\d{2}/\\d{4})\\s+(\\d{2}/\\d{2}/\\d{4})\\s+PAYMENT\\s+([\\d,]+\\.\\d{2}-)\', line)\n',
'                if pmt_m: data_rows[target_idx]["transactions"].append({"date": pmt_m.group(1), "post_date": pmt_m.group(2), "desc": "ชำระเงินคืน", "branch": "", "type": "ชำระเงิน", "amount": pmt_m.group(3).replace(\'-\', \'\')})\n',
'            footer_m = re.search(r\'ยอดเงินรวม.*?\\(Total.*?Amount\\)\\s*([\\d,]+\\.\\d{2})\', section, re.IGNORECASE)\n',
'            if footer_m: data_rows[target_idx]["balance"] = data_rows[target_idx]["total_balance_calc"] = footer_m.group(1).replace(\',\', \'\')\n',
'            data_rows[target_idx]["transaction_count"] = len(data_rows[target_idx]["transactions"])\n',
'    return {"data": data_rows, "summary": {"previous_balance": global_prev_bal, "current_total": global_curr_total}}\n',
'\n',
'\n',
'# The helper functions from your existing main.py (you should keep them if they are below)\n',
])

# Now append any functions that were originally BELOW extract_bbl_ocr.
# Let's find them.
orig_below_idx = -1
for i, line in enumerate(lines):
    if 'def _build_page_quality(' in line:
        orig_below_idx = i
        break

if orig_below_idx != -1:
    for i in range(orig_below_idx, len(lines)):
        final_lines.append(lines[i])

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(final_lines)
