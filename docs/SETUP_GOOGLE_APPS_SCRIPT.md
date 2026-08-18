# Panduan Setup Google Apps Script & Google Spreadsheet

Ikuti langkah-langkah berikut untuk memasang aplikasi Penjualan Gas LPG Koperasi Desa Merah Putih (KDMP) Desa Gulun:

---

## Langkah 1: Buat File Google Spreadsheet Baru

1. Buka [Google Sheets](https://sheets.new) di browser Anda.
2. Beri judul spreadsheet: **Database Gas LPG KDMP Desa Gulun**.
3. Di menu atas, klik **Ekstensi (Extensions)** > **Apps Script**.

---

## Langkah 2: Salin File Kode ke Apps Script Editor

Di editor Google Apps Script, buat berkas-berkas berikut sesuai struktur proyek:

### 1. File Skrip (.gs) — Tambahkan 6 file:
- `Code.gs` &rarr; Salin dari file [`src/Code.gs`](file:///c:/xampp/htdocs/google_apps_script/src/Code.gs)
- `ServiceMember.gs` &rarr; Salin dari file [`src/ServiceMember.gs`](file:///c:/xampp/htdocs/google_apps_script/src/ServiceMember.gs)
- `ServiceQueue.gs` &rarr; Salin dari file [`src/ServiceQueue.gs`](file:///c:/xampp/htdocs/google_apps_script/src/ServiceQueue.gs)
- `ServiceTransaction.gs` &rarr; Salin dari file [`src/ServiceTransaction.gs`](file:///c:/xampp/htdocs/google_apps_script/src/ServiceTransaction.gs)
- `ServiceReport.gs` &rarr; Salin dari file [`src/ServiceReport.gs`](file:///c:/xampp/htdocs/google_apps_script/src/ServiceReport.gs)
- `Api.gs` &rarr; Salin dari file [`src/Api.gs`](file:///c:/xampp/htdocs/google_apps_script/src/Api.gs)

### 2. File HTML (Klik tanda `+` > HTML) — Tambahkan 8 file:
- `Index.html` &rarr; Salin dari file [`src/views/Index.html`](file:///c:/xampp/htdocs/google_apps_script/src/views/Index.html)
- `Header.html` &rarr; Salin dari file [`src/views/Header.html`](file:///c:/xampp/htdocs/google_apps_script/src/views/Header.html)
- `PublicHomeView.html` &rarr; Salin dari file [`src/views/PublicHomeView.html`](file:///c:/xampp/htdocs/google_apps_script/src/views/PublicHomeView.html)
- `QueueView.html` &rarr; Salin dari file [`src/views/QueueView.html`](file:///c:/xampp/htdocs/google_apps_script/src/views/QueueView.html)
- `DashboardView.html` &rarr; Salin dari file [`src/views/DashboardView.html`](file:///c:/xampp/htdocs/google_apps_script/src/views/DashboardView.html)
- `MemberView.html` &rarr; Salin dari file [`src/views/MemberView.html`](file:///c:/xampp/htdocs/google_apps_script/src/views/MemberView.html)
- `Style.html` &rarr; Salin dari file [`src/views/Style.html`](file:///c:/xampp/htdocs/google_apps_script/src/views/Style.html)
- `Script.html` &rarr; Salin dari file [`src/views/Script.html`](file:///c:/xampp/htdocs/google_apps_script/src/views/Script.html)

---

## Langkah 3: Inisialisasi Database Spreadsheet

1. Pada dropdown fungsi di bagian atas Apps Script Editor, pilih fungsi **`setupDatabase`**.
2. Klik tombol **Run / Jalankan** (▶).
3. Berikan izin akses (*Review Permissions* &rarr; *Allow*).
4. Fungsi ini akan secara otomatis membuat 5 lembar kerja (Sheet) di spreadsheet Anda:
   - `ANGGOTA` (Master data & riwayat kuota)
   - `BATCH_PENGIRIMAN` (Jadwal 25 tabung tiap Jumat)
   - `ANTRIAN_DISTRIBUSI` (10 kolom termasuk pelacakan log WhatsApp)
   - `TRANSAKSI_PENJUALAN` (Catatan bayar & ambil)
   - `PENGATURAN` (Nama koperasi, kuota batch, harga resmi, & PIN Admin default `123456`)

---

## Langkah 4: Impor Data Anggota dari Spreadsheet Referensi

1. Pada dropdown fungsi di Apps Script Editor, pilih fungsi **`importMembersFromReference`**.
2. Klik tombol **Run / Jalankan** (▶).
3. Fungsi ini akan **hanya membaca** data dari sheet **`template_simkopdes`** pada file referensi tanpa mengubah aslinya, lalu memetakan kolom NIK, Nama, No HP/WA, dan Alamat RT/RW warga Desa Gulun secara otomatis ke sheet `ANGGOTA` baru Anda.

---

---

## Langkah 5: Setel Kunci Keamanan API (Script Properties)

Untuk mengamankan endpoint API dari manipulasi publik / pihak yang tidak berhak dan menghubungkan dengan MCP Server:
1. Di bilah menu kiri Apps Script Editor, klik **Project Settings** (ikon roda gigi ⚙️).
2. Gulir ke bawah ke bagian **Script Properties (Properti Skrip)**.
3. Klik **Add script property (Tambah properti skrip)**:
   - **Property**: `API_SECRET_KEY`
   - **Value**: Masukkan kode rahasia unik/acak yang panjang (contoh: `kdmp_gas_gulun_secret_key_2026_x89a!`)
4. Klik **Save script properties (Simpan properti skrip)**.

---

## Langkah 6: Deploy Menjadi Web App

1. Di pojok kanan atas Apps Script, klik tombol **Deploy** > **New deployment**.
2. Pilih jenis: **Web app** (ikon roda gigi).
3. Isi konfigurasi:
   - **Description**: `Sistem Distribusi Gas LPG KDMP Desa Gulun v1.0`
   - **Execute as**: `Me` (email akun Google Anda)
   - **Who has access**: `Anyone` (agar warga dapat melihat beranda & status antrian publik, sementara pengurus/admin & API diverifikasi lewat kredensial)
4. Klik **Deploy**.
5. Salin **Web app URL** (contoh: `https://script.google.com/macros/s/AKfycb.../exec`).
6. Masukkan URL tersebut dan `API_SECRET_KEY` ke konfigurasi MCP Server Anda (`.env` atau file konfigurasi MCP).

> **💡 Catatan Keamanan**: 
> - Semua operasi tulis/modifikasi database (tambah/edit anggota, buat batch, generate antrian, tukar antrian, konfirmasi kasir, ubah PIN, dsb.) **wajib** memiliki API Key yang valid via API/MCP Server atau sesi login Admin via Web App.
> - Pengguna publik hanya dapat membaca data tampilan publik (jadwal & nomor antrian tanpa nomor HP/NIK dan ringkasan kuota).
