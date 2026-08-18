# Panduan Operasional Pengurus Koperasi Desa Merah Putih (KDMP) Desa Gulun

Buku panduan praktis pengelolaan distribusi kuota gas LPG 3kg untuk pengurus, petugas kasir pangkalan, dan warga anggota KDMP Desa Gulun.

---

## 1. Akses Sistem: Mode Publik vs Mode Pengurus (Admin)

Aplikasi Web KDMP Desa Gulun dirancang dengan 2 tingkatan akses yang aman dan mudah:

| Halaman / Fitur | Pengunjung Umum / Warga | Pengurus / Admin Koperasi |
| :--- | :---: | :---: |
| **🏠 Beranda & Info Publik** | ✅ Terbuka (Tanpa Login) | ✅ Terbuka |
| **📊 Laporan Rekapitulasi** | ✅ Terbuka (Nomor HP Tersembunyi) | ✅ Terbuka + Lengkap No HP & Tombol CSV |
| **📋 Antrian Batch & Kasir** | ❌ Terkunci | ✅ Akses Penuh via PIN Admin |
| **👥 Master Anggota** | ❌ Terkunci | ✅ Akses Penuh via PIN Admin |
| **⚙️ Setup & Ganti PIN** | ❌ Terkunci | ✅ Akses Penuh via PIN Admin |

> **🔐 Cara Masuk Mode Admin**:
> 1. Klik tombol **`🔐 Login Admin`** di pojok kanan atas.
> 2. Masukkan PIN Admin (Default awal: **`123456`**).
> 3. Menu pengelolaan antrian, kasir, anggota, dan setup akan otomatis muncul.

---

## 2. Siklus Distribusi Mingguan (Hari Jumat Sore)

Setiap bulan pangkalan menerima pasokan **100 tabung**, yang disalurkan dalam **4 siklus pengiriman (25 tabung setiap hari Jumat pukul 16:00 WIB)**:

```
MINGGU I   (Jumat Sore): Batch 1 -> 25 Anggota Prioritas 1–25
MINGGU II  (Jumat Sore): Batch 2 -> 25 Anggota Prioritas 26–50
MINGGU III (Jumat Sore): Batch 3 -> 25 Anggota Prioritas 51–75
MINGGU IV  (Jumat Sore): Batch 4 -> 25 Anggota Prioritas 76–100
------------------------------------------------------------------
Sisa 50 anggota yang belum dapat bulan ini otomatis menjadi antrian
prioritas Batch 1 & 2 di awal bulan berikutnya (Sistem Bergulir Adil).
```

---

## 3. Alur Kerja Pengurus Setiap Hari Jumat

### Langkah 1: Generate Antrian Berkeadilan
1. Buka Web App KDMP Desa Gulun di HP atau Laptop pengurus, lalu Login Admin.
2. Di tab **📋 Antrian Batch**, pilih batch Jumat berjalan (atau klik `+ Batch Baru` jika belum ada).
3. Klik tombol **`⚡ Generate Antrian (25 Tabung)`**.
4. Algoritma otomatis memilih 25 warga paling berhak:
   - Anggota yang bulan ini belum pernah membeli (0 tabung) diprioritaskan di nomor atas.
   - Anggota yang paling lama tidak membeli gas akan ditempatkan di nomor antrian awal.

---

### Langkah 2: Publikasi & Notifikasi WhatsApp (Massal & Personal)
Sistem menyediakan dua cara notifikasi ke warga:

1. **Pengumuman Grup WhatsApp Desa (Massal)**:
   - Klik tombol **`📢 Salin Teks WA`** di bagian atas tab antrian.
   - Buka grup WhatsApp Warga Desa Gulun dan tempelkan (*paste*).
   - Pesan memuat daftar 25 nama anggota, nomor urut, waktu ambil, dan tautan portal beranda publik.
2. **Pengingat WhatsApp Personal ke Tiap Warga**:
   - Pada kartu antrian masing-masing warga, klik tombol hijau **`📱 WA`**.
   - Sistem akan langsung membuka aplikasi/web WhatsApp dengan draf pesan pengingat personal ramah warga (nama, nomor antrian, harga dinamis, dan jadwal Jumat).
   - Waktu pengiriman akan dicatat otomatis (*timestamp*) dan muncul di kartu antrian sebagai bukti konfirmasi.
3. **Pengecekan Mandiri oleh Warga**:
   - Warga dapat langsung membuka link beranda publik, mengetikkan nama di kolom pencarian, atau memilih riwayat pengiriman per-Jumat pada dropdown filter batch.

---

### Langkah 3: Menangani Penyesuaian di Lapangan (Fleksibel)
Jika pada hari H terjadi situasi khusus:

- **Kasus A: Warga Ingin Mengambil Duluan (Tukar Jam)**
  - Klik tombol **`⇄ Tukar`** pada kartu antrian warga tersebut.
  - Pilih nomor antrian tujuan tukar. Posisi jam ambil bertukar tanpa mengganggu jatah kuota masing-masing.
- **Kasus B: Warga Berhalangan & Jatah Dialihkan / Dititipkan ke Tetangga**
  - Klik tombol **`✎ Ganti Orang`** pada kartu antrian.
  - Pilih nama anggota pengganti yang riil membeli dan masukkan catatan alasan.
  - **Keuntungan Sistem:** Riwayat beli akan dicatatkan pada **anggota pengganti**, sedangkan anggota awal tetap berstatus belum beli sehingga akan otomatis diprioritaskan di batch Jumat berikutnya!
- **Kasus C: Warga Tidak Hadir / Lewat Batas Waktu**
  - Klik tombol **`✕ Lewat`** untuk menandai status `BATAL_LEWAT` agar slot dapat diberikan ke anggota cadangan yang siap di pangkalan.

---

### Langkah 4: Kasir Cepat 1-Klik & Penyerahan Gas
1. Saat warga tiba di lokasi pangkalan membawa tabung kosong:
2. Klik tombol hijau **`✓ Ambil & Bayar`** pada kartu nomor antriannya.
3. Pilih metode pembayaran: **TUNAI** (mengikuti harga resmi pada konfigurasi), **QRIS**, atau **TRANSFER**.
4. Masukkan nama pengambil fisik (jika diwakilkan keluarga).
5. Klik **`✓ Serahkan Gas & Selesai`**.
6. Stok batch otomatis berkurang, status kartu berubah menjadi hijau (*✓ Sudah Diambil*), dan kuota anggota terdata di sistem.

---

## 4. Monitoring & Laporan di Dashboard Transparansi

Pengurus, kepala desa, dan seluruh warga dapat memantau realisasi kuota secara langsung di tab **📊 Laporan Rekap**:
- **Statistik Kuota Bulanan**: Memantau berapa tabung yang sudah terealisasi dari kuota 100 tabung per bulan.
- **Penyaringan Cepat**:
  - Filter `⏳ Belum Dapat Bulan Ini (Prioritas)` untuk melihat warga yang berhak atas alokasi berikutnya.
  - Filter `✅ Sudah Dapat Bulan Ini` untuk audit penyaluran.
  - Pencarian berdasarkan nama, NIK, atau nomor RT/RW.
- **Unduh Laporan (Khusus Admin)**: Klik tombol **`📥 Download CSV`** untuk mengunduh rekapitulasi data penjualan ke format Excel/Spreadsheet untuk laporan resmi pengurus koperasi.

---

## 5. Keamanan & Pergantian PIN Admin

Untuk menjaga keamanan operasional pangkalan:
1. Buka tab **⚙️ Setup & PIN** (hanya terlihat saat login Admin).
2. Pada kartu **Keamanan & Autentikasi**, masukkan PIN Lama dan PIN Baru (minimal 4 digit).
3. Klik **`Simpan PIN Baru`**. PIN baru langsung tersimpan aman di database Spreadsheet.

---

## 6. Prosedur Pergantian Bulan Baru (Reset Siklus Kuota)

Pada awal bulan baru (setiap tanggal 1):
1. Buka tab **⚙️ Setup & PIN**.
2. Klik tombol **`🔄 Reset Kuota untuk Bulan Baru`**.
3. Sistem akan mereset kolom `total_beli_bulan_ini` menjadi 0 untuk seluruh anggota, sementara `total_beli_kumulatif` tetap tersimpan aman. Siklus 100 tabung baru siap bergulir secara adil!

