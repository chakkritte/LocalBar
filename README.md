# 🟧 LocalBar

> **Your Private AI Side-Bar & Autonomous Browser Agent — Powered 100% by Local Ollama.**  
> ผู้ช่วย AI ประจำเบราว์เซอร์ในแถบ Side Panel ดีไซน์อบอุ่นมินิมอล พร้อมระบบ **Chrome Debugger HUD** ที่ช่วยอ่านหน้าเว็บ สแกนฟอร์ม และขยับเมาส์กรอกข้อมูลให้เองแบบ Local 100% ไม่ต้องง้อ Cloud API

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-d97757?style=flat-square&logo=googlechrome&logoColor=white)
![Ollama](https://img.shields.io/badge/Backend-Ollama_Local-1f1e1d?style=flat-square)
![Privacy](https://img.shields.io/badge/Privacy-100%25_Offline-2e7d32?style=flat-square)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero_(Vanilla_JS)-6e6b65?style=flat-square)

---

## ✨ จุดเด่น (Key Features)

- 🧠 **100% Local & Private (Ollama Powered)**  
  เชื่อมต่อตรงกับ `http://localhost:11434` ดึงรายชื่อโมเดลในเครื่องอัตโนมัติ (`/api/tags`) รองรับการสตรีมข้อความแบบ Real-time (`/api/chat`) ข้อมูลหน้าเว็บและรหัสผ่านไม่รั่วไหลออกนอกเครื่อง
- 🛠️ **Autonomous Browser Agent & Chrome Debugger HUD**  
  เมื่อสั่งงานบนหน้าเว็บ LocalBar จะเปิดโหมด `chrome.debugger` พร้อมแสดงกรอบแสงสีส้ม Terracotta, แถบสถานะ **Floating HUD Bar**, ป้ายกำกับ **`#ID` Badges** บนทุก Input/Button และจำลองเคอร์เซอร์เคลื่อนที่ไปกรอกข้อมูลให้เห็นแบบสดๆ
- ⚡ **Dual Execution Modes (`Auto` / `Manual`)**
  - **⚡ Auto Mode**: AI วิเคราะห์หน้าเว็บ เปิดโหมด Dev กรอกฟอร์ม/เลือก Dropdown/ติ๊ก Checkbox ให้ทันที และ **ปิดโหมด Dev อัตโนมัติ** เมื่อทำงานเสร็จ
  - **🖐️ Manual Mode**: AI เตรียมรายการคำสั่ง (`Action Card`) ให้คุณตรวจสอบในแชทก่อนกดยืนยันรันจริง
- 📄 **Context-Aware Page Reader**  
  ดึงเนื้อหาหน้าเว็บปัจจุบัน ข้อความที่คุณคลุมดำ (Highlight Selection) และโครงสร้าง DOM ของฟอร์มทั้งหมดส่งให้ AI วิเคราะห์ได้ในคลิกเดียว
- 🔓 **Zero-Config CORS Bypass**  
  แก้ปัญหา `403 Forbidden` ของ Ollama บน Chrome Extension ให้โดยอัตโนมัติด้วย `declarativeNetRequest` ในตัว ไม่ต้องตั้งค่า Environment Variable ให้ยุ่งยาก
- 🎨 **Warm Terracotta UI & Safe Markdown Renderer**  
  อินเทอร์เฟซโทนสีอุ่นสบายตาสไตล์ Claude พร้อมตัวแปลง Markdown ในตัว (รองรับตาราง, Code Blocks, Blockquote, รายการ) ที่ป้องกัน XSS อย่างปลอดภัยโดยไม่พึ่งพาไลบรารีภายนอก

---

## 🚀 วิธีติดตั้งและใช้งาน (Getting Started)

### 1. เตรียม Ollama ในเครื่อง
1. ติดตั้งและเปิดโปรแกรม [Ollama](https://ollama.com/) (ทำงานที่พอร์ตเริ่มต้น `11434`)
2. ดาวน์โหลดโมเดลที่ต้องการใช้งาน เช่น:
   ```bash
   ollama pull qwen2.5:14b
   # หรือโมเดลใดก็ได้ที่คุณมีในเครื่อง
   ```

### 2. ติดตั้ง LocalBar ลงใน Chrome / Edge / Brave
1. Clone หรือดาวน์โหลด Repository นี้ลงในเครื่อง:
   ```bash
   git clone https://github.com/your-username/localbar.git
   ```
2. เปิดเบราว์เซอร์แล้วไปที่หน้า **`chrome://extensions/`**
3. เปิดสวิตช์ **Developer mode (โหมดนักพัฒนาซอฟต์แวร์)** ที่มุมขวาบน
4. คลิกปุ่ม **Load unpacked (โหลดส่วนขยายที่ยังไม่ได้แพ็ก)** แล้วเลือกโฟลเดอร์ของโปรเจคนี้
5. คลิกที่ไอคอน **LocalBar** บนแถบเครื่องมือเบราว์เซอร์เพื่อเปิด **Side Panel** ด้านข้าง

---

## 🎮 การใช้งานโหมดควบคุมหน้าเว็บ (Form & DOM Agent)

ภายในแถบ **LocalBar** คุณสามารถสั่งงานด้วยปุ่มลัด (Quick Chips) หรือพิมพ์คำสั่งภาษาธรรมชาติได้เลย:

| คำสั่งตัวอย่าง | สิ่งที่ LocalBar ทำ |
| :--- | :--- |
| **"📝 สรุปหน้านี้"** | อ่านเนื้อหาทั้งหมดในแท็บปัจจุบัน (หรือข้อความที่คลุมดำไว้) แล้วสรุปเป็นหัวข้อ Markdown |
| **"🔍 สแกนป้าย #ID ฟอร์ม"** | ติดป้ายหมายเลข `#1`, `#2`, `#3`... บนช่องกรอกข้อมูลและปุ่มทั้งหมดในหน้าเว็บ พร้อมสรุปเป็นตาราง |
| **"ช่วยกรอกฟอร์มสมัครสมาชิกด้วยข้อมูลสมมติ"** | สแกนฟอร์ม สร้างข้อมูลจำลอง เปิดโหมด Debugger เลื่อนเมาส์ไปกรอกให้ครบทุกช่อง (รองรับ React/Vue Controlled Inputs) |
| **"กรอกช่องชื่อว่า สมชาย และเลือกประเทศเป็น Thailand"** | เลือกกรอกและเปลี่ยนค่า `<select>` ตามเงื่อนไขที่สั่งโดยตรง |

> 💡 **ความปลอดภัยในการส่งฟอร์ม**: ระบบ Prompt ของ LocalBar ถูกตั้งกฎเหล็กไว้ว่า **ห้ามกดปุ่ม Submit ส่งฟอร์มเองโดยเด็ดขาด** ยกเว้นผู้ใช้จะสั่งให้กดส่งอย่างชัดเจน

---

## 🧩 สถาปัตยกรรมและโครงสร้างไฟล์ (Project Structure)

โปรเจคนี้พัฒนาด้วย **Vanilla JavaScript (Zero Build Step / Zero Dependencies)** เพื่อให้ตรวจสอบโค้ดได้ง่าย เบา และปลอดภัยที่สุด:

```text
localbar/
├── manifest.json     # Manifest V3 config, permissions (sidePanel, debugger, scripting, DNR)
├── background.js     # Service Worker จัดการการเปิด Side Panel และแก้ CORS ของ Ollama อัตโนมัติ
├── sidepanel.html    # โครงสร้าง UI และระบบ CSS Variables โทนสี Warm Terracotta
├── sidepanel.js      # หัวใจหลัก: Ollama Stream Client, Markdown Parser, DOM Scanner & Debugger Agent
└── README.md         # เอกสารแนะนำโปรเจค
```

---

## 🔌 รูปแบบคำสั่ง Action Protocol (สำหรับนักพัฒนา)

เมื่อเปิดใช้งานฟีเจอร์ **✍️ กรอกฟอร์ม** LocalBar จะแนบโครงสร้างฟอร์มที่สแกนได้ไปใน System Prompt และให้โมเดลส่งคำสั่งควบคุมกลับมาในบล็อก ```` ```action ```` รูปแบบ JSON Array:

```json
[
  { "action": "fill", "id": 1, "value": "สมชาย ใจดี", "label": "ชื่อ-นามสกุล" },
  { "action": "select", "id": 2, "value": "TH", "label": "ประเทศ" },
  { "action": "check", "id": 3, "checked": true, "label": "ยอมรับเงื่อนไข" },
  { "action": "click", "id": 4, "label": "บันทึกฉบับร่าง" }
]
```

ตัว `sidepanel.js` จะซ่อนบล็อกคำสั่งดิบออกจากหน้าแชท แปลงเป็น **Action Card** ที่สวยงาม และสั่งรันผ่าน `chrome.scripting` ร่วมกับ `chrome.debugger` (`Input.dispatchMouseEvent` + Native Value Setter สำหรับ React/Next.js/Vue)

---

## 📄 License

Distributed under the **MIT License**. Feel free to fork, modify, and build your own local browser agent!
