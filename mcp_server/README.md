# MCP Server - Sistem Distribusi & Penjualan Gas LPG KDMP Desa Gulun

Model Context Protocol (MCP) Server ini memungkinkan Agen AI (seperti **Antigravity**, **Claude Desktop**, atau **Cursor**) untuk berinteraksi dan mengoperasikan sistem aplikasi Google Apps Script serta database Google Spreadsheet pangkalan KDMP Desa Gulun.

---

## 🛠️ Daftar 12 Tools AI yang Tersedia

1. `get_dashboard_analytics`: Mengambil ringkasan KPI, total anggota terlayani, sisa kuota bulanan dari 100 tabung, dan breakdown RT/RW.
2. `get_current_batches`: Melihat daftar jadwal batch kedatangan Jumat sore beserta status stok.
3. `create_new_batch`: Membuat jadwal batch pengiriman baru untuk hari Jumat (`tglJadwal`, `waktuKirim`, `jumlahStok`).
4. `generate_queue_batch`: Meng-generate 25 antrian otomatis berbasis algoritma prioritas berkeadilan (*fair round-robin*).
5. `get_batch_queue`: Melihat daftar 25 nama anggota antrian, nomor urut, dan status pengambilannya.
6. `swap_queue_position`: Menukar nomor urut antrian di lapangan jika ada anggota yang ingin mengambil duluan.
7. `replace_queue_member`: Mengganti anggota penerima (jatah dialihkan/titip) dan mencatat riwayat transaksi ke pembeli aktual.
8. `confirm_gas_pickup`: Kasir 1-klik: mencatat konfirmasi fisik gas telah diserahkan dan dibayar (TUNAI, QRIS, TRANSFER).
9. `get_member_purchase_report`: Mencari data anggota, riwayat beli kumulatif/bulanan, atau memfilter yang belum pernah dapat.
10. `register_new_member`: Mendaftarkan warga baru ke master database anggota (`nama_lengkap`, `no_ktp`, `rt_rw`, `no_whatsapp`).
11. `sync_reference_members`: Menyalin 150 data anggota dari sheet `template_simkopdes` pada spreadsheet referensi secara aman.
12. `record_wa_sent`: Mencatat waktu pengiriman WhatsApp pengingat pada slot antrian tertentu ke database.

---

## 🚀 Cara Menjalankan MCP Server

Tersedia dua opsi runtime: **Node.js (TypeScript)** dan **Python (FastMCP)**.

### Opsi A: Menggunakan Node.js / TypeScript (Direkomendasikan)

1. **Install Dependencies & Build**:
   ```powershell
   cd c:\xampp\htdocs\google_apps_script\mcp_server
   npm install
   npm run build
   ```

2. **Konfigurasi Variabel Lingkungan (.env)**:
   Buat file `.env` di folder `mcp_server`:
   ```env
   GAS_WEBAPP_URL=https://script.google.com/macros/s/AKfycb.../exec
   ```

---

### Opsi B: Menggunakan Python (FastMCP)

1. **Install Dependencies**:
   ```powershell
   pip install mcp requests
   ```

2. **Jalankan Server**:
   ```powershell
   $env:GAS_WEBAPP_URL="https://script.google.com/macros/s/AKfycb.../exec"
   python server.py
   ```

---

## ⚙️ Menghubungkan ke Klien AI

### 1. Konfigurasi untuk Antigravity IDE / Claude Desktop
Tambahkan blok konfigurasi berikut pada pengaturan MCP Anda:

```json
{
  "mcpServers": {
    "gas-kdmp-gulun": {
      "command": "node",
      "args": ["c:/xampp/htdocs/google_apps_script/mcp_server/dist/index.js"],
      "env": {
        "GAS_WEBAPP_URL": "https://script.google.com/macros/s/AKfycb.../exec"
      }
    }
  }
}
```

*Atau jika menggunakan Python:*
```json
{
  "mcpServers": {
    "gas-kdmp-gulun": {
      "command": "python",
      "args": ["c:/xampp/htdocs/google_apps_script/mcp_server/server.py"],
      "env": {
        "GAS_WEBAPP_URL": "https://script.google.com/macros/s/AKfycb.../exec"
      }
    }
  }
}
```

---

## 💬 Contoh Perintah Melalui Agen AI

- *"Berapa sisa kuota gas bulan ini dan berapa warga yang belum kebagian jatah?"*
- *"Tolong buatkan jadwal batch dan generate antrian 25 orang untuk Jumat besok tanggal 21 Agustus 2026."*
- *"Pak Joko di antrian no 5 ingin jatahnya dialihkan ke Pak Sukirno (MBR-042), tolong gantikan penerimanya."*
- *"Catat antrian no 1 atas nama Bpk Sudiyanto sudah mengambil gas dan bayar tunai Rp 20.000."*
- *"Tampilkan daftar warga RT 02 yang belum pernah menerima gas pada bulan ini."*
- *"Tandai bahwa WhatsApp pengingat untuk antrian Q-20260821-003 sudah dikirimkan."*

