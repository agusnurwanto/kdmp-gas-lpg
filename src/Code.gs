/**
 * ==============================================================================
 * SISTEM APLIKASI PENJUALAN GAS LPG KOPERASI DESA MERAH PUTIH (KDMP) DESA GULUN
 * ==============================================================================
 * Backend & Controller Utama (Google Apps Script)
 * 
 * Pengelolaan Database Google Spreadsheet, Router Web App (HTML Service),
 * Router REST API untuk Integrasi MCP Server / Agen AI.
 */

// Konstanta Konfigurasi Default
const CONFIG = {
  APP_NAME: "Sistem Gas LPG - KDMP Desa Gulun",
  DEFAULT_QUOTA_PER_BATCH: 25,
  MONTHLY_QUOTA: 100,
  DEFAULT_PRICE: 20000,
  REFERENCE_SHEET_ID: "isi dengan id spreadhseet yang ada nama sheet template_simkopdes",
  SHEETS: {
    ANGGOTA: "ANGGOTA",
    BATCH_PENGIRIMAN: "BATCH_PENGIRIMAN",
    ANTRIAN_DISTRIBUSI: "ANTRIAN_DISTRIBUSI",
    TRANSAKSI_PENJUALAN: "TRANSAKSI_PENJUALAN",
    PENGATURAN: "PENGATURAN"
  }
};

/**
 * Endpoint GET Web App (Merender Antarmuka HTML atau memproses API GET)
 */
function doGet(e) {
  try {
    // Jika ada parameter 'api', proses sebagai response JSON untuk MCP/Webhook
    if (e && e.parameter && (e.parameter.api || e.parameter.action)) {
      return handleApiGet(e.parameter);
    }

    // Render Web App Single Page Application
    const template = HtmlService.createTemplateFromFile("Index");
    template.appName = CONFIG.APP_NAME;
    
    return template.evaluate()
      .setTitle(CONFIG.APP_NAME)
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return HtmlService.createHtmlOutput("<pre>Terjadi Kesalahan: " + error.message + "</pre>");
  }
}

/**
 * Endpoint POST Web App (Menerima permintaan JSON dari MCP Server / Agen AI)
 */
function doPost(e) {
  try {
    let requestData = {};
    if (e.postData && e.postData.contents) {
      try {
        requestData = JSON.parse(e.postData.contents);
      } catch (err) {
        requestData = e.parameter || {};
      }
    } else {
      requestData = e.parameter || {};
    }

    const result = handleApiPost(requestData);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "API Error: " + error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper untuk menyisipkan konten berkas HTML terpisah (include)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Mendapatkan Spreadsheet Database aktif
 */
function getDatabase() {
  const props = PropertiesService.getScriptProperties();
  const customId = props.getProperty("SPREADSHEET_ID");
  
  if (customId) {
    return SpreadsheetApp.openById(customId);
  }
  
  // Jika script terikat langsung (container-bound)
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  throw new Error("ID Spreadsheet belum disetel. Jalankan setupDatabase() atau setel properti 'SPREADSHEET_ID'.");
}

/**
 * Fungsi Setup Inisialisasi Database Google Spreadsheet
 * Membuat 5 sheet tabel jika belum ada dan mengisi konfigurasi awal.
 */
function setupDatabase(spreadsheetId) {
  let ss;
  if (spreadsheetId) {
    PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", spreadsheetId);
    ss = SpreadsheetApp.openById(spreadsheetId);
  } else {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      const propId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
      if (propId) ss = SpreadsheetApp.openById(propId);
    }
  }

  if (!ss) {
    throw new Error("Harap berikan Spreadsheet ID atau pasang skrip ini di dalam Google Spreadsheet.");
  }

  // 1. Sheet ANGGOTA
  let sheetAnggota = ss.getSheetByName(CONFIG.SHEETS.ANGGOTA);
  if (!sheetAnggota) {
    sheetAnggota = ss.insertSheet(CONFIG.SHEETS.ANGGOTA);
    sheetAnggota.getRange(1, 1, 1, 11).setValues([[
      "id_anggota", "no_ktp", "no_kk", "nama_lengkap", "rt_rw",
      "no_whatsapp", "status_aktif", "total_beli_kumulatif",
      "total_beli_bulan_ini", "tgl_terakhir_beli", "catatan"
    ]]).setFontWeight("bold").setBackground("#DC2626").setFontColor("#FFFFFF");
    sheetAnggota.setFrozenRows(1);
  }

  // 2. Sheet BATCH_PENGIRIMAN
  let sheetBatch = ss.getSheetByName(CONFIG.SHEETS.BATCH_PENGIRIMAN);
  if (!sheetBatch) {
    sheetBatch = ss.insertSheet(CONFIG.SHEETS.BATCH_PENGIRIMAN);
    sheetBatch.getRange(1, 1, 1, 8).setValues([[
      "id_batch", "tgl_jadwal", "hari", "waktu_kirim",
      "jumlah_stok", "jumlah_terambil", "sisa_stok", "status_batch"
    ]]).setFontWeight("bold").setBackground("#1E293B").setFontColor("#FFFFFF");
    sheetBatch.setFrozenRows(1);
  }

  // 3. Sheet ANTRIAN_DISTRIBUSI
  let sheetAntrian = ss.getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  if (!sheetAntrian) {
    sheetAntrian = ss.insertSheet(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
    sheetAntrian.getRange(1, 1, 1, 10).setValues([[
      "id_antrian", "id_batch", "no_urut", "id_anggota_asli",
      "id_anggota_penerima", "status_antrian", "keterangan_penyesuaian",
      "waktu_generate", "waktu_ambil", "waktu_terakhir_wa"
    ]]).setFontWeight("bold").setBackground("#0284C7").setFontColor("#FFFFFF");
    sheetAntrian.setFrozenRows(1);
  } else {
    // Pastikan kolom ke-10 (waktu_terakhir_wa) ada jika sheet sudah dibuat sebelumnya
    const lastCol = sheetAntrian.getLastColumn();
    if (lastCol < 10) {
      sheetAntrian.getRange(1, 10).setValue("waktu_terakhir_wa")
        .setFontWeight("bold").setBackground("#0284C7").setFontColor("#FFFFFF");
    }
  }

  // 4. Sheet TRANSAKSI_PENJUALAN
  let sheetTrx = ss.getSheetByName(CONFIG.SHEETS.TRANSAKSI_PENJUALAN);
  if (!sheetTrx) {
    sheetTrx = ss.insertSheet(CONFIG.SHEETS.TRANSAKSI_PENJUALAN);
    sheetTrx.getRange(1, 1, 1, 11).setValues([[
      "id_transaksi", "id_antrian", "id_batch", "id_anggota",
      "tgl_waktu_transaksi", "jumlah_tabung", "harga_per_tabung",
      "total_bayar", "metode_bayar", "nama_pengambil", "petugas_pencatat"
    ]]).setFontWeight("bold").setBackground("#16A34A").setFontColor("#FFFFFF");
    sheetTrx.setFrozenRows(1);
  }

  // 5. Sheet PENGATURAN
  let sheetConfig = ss.getSheetByName(CONFIG.SHEETS.PENGATURAN);
  if (!sheetConfig) {
    sheetConfig = ss.insertSheet(CONFIG.SHEETS.PENGATURAN);
    sheetConfig.getRange(1, 1, 1, 2).setValues([["Kunci", "Nilai"]])
      .setFontWeight("bold").setBackground("#64748B").setFontColor("#FFFFFF");
    sheetConfig.getRange(2, 1, 5, 2).setValues([
      ["NAMA_KOPERASI", "Koperasi Desa Merah Putih (KDMP) Desa Gulun"],
      ["KUOTA_PER_BATCH", "25"],
      ["HARGA_PER_TABUNG", "20000"],
      ["ATURAN_ROTASI", "FAIR_PRIORITY_ROUND_ROBIN"],
      ["ADMIN_PIN", "123456"]
    ]);
  }

  return {
    success: true,
    message: "Struktur database Google Spreadsheet berhasil disiapkan!",
    spreadsheetId: ss.getId(),
    url: ss.getUrl()
  };
}

/**
 * Mendapatkan PIN Admin dari sheet PENGATURAN
 */
function getAdminPin() {
  try {
    const db = getDatabase();
    const sheet = db.getSheetByName(CONFIG.SHEETS.PENGATURAN);
    if (!sheet) return "123456";
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).toUpperCase() === "ADMIN_PIN") {
        return String(values[i][1]).trim();
      }
    }
  } catch (e) {}
  return "123456";
}

/**
 * Mengambil semua pengaturan aplikasi dari sheet PENGATURAN (untuk frontend)
 */
function getAppSettings() {
  try {
    const db = getDatabase();
    const sheet = db.getSheetByName(CONFIG.SHEETS.PENGATURAN);
    const defaults = {
      NAMA_KOPERASI: CONFIG.APP_NAME,
      KUOTA_PER_BATCH: String(CONFIG.DEFAULT_QUOTA_PER_BATCH),
      HARGA_PER_TABUNG: String(CONFIG.DEFAULT_PRICE),
      ATURAN_ROTASI: "FAIR_PRIORITY_ROUND_ROBIN"
    };
    if (!sheet) return defaults;
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      const key = String(values[i][0]).trim().toUpperCase();
      if (key && key !== "ADMIN_PIN") {
        defaults[key] = String(values[i][1]).trim();
      }
    }
    return defaults;
  } catch (e) {
    return {
      NAMA_KOPERASI: CONFIG.APP_NAME,
      KUOTA_PER_BATCH: String(CONFIG.DEFAULT_QUOTA_PER_BATCH),
      HARGA_PER_TABUNG: String(CONFIG.DEFAULT_PRICE),
      ATURAN_ROTASI: "FAIR_PRIORITY_ROUND_ROBIN"
    };
  }
}

/**
 * Autentikasi Login Admin Pengurus
 */
function loginAdmin(pinInput) {
  const currentPin = getAdminPin();
  const cleanInput = String(pinInput || "").trim();

  if (cleanInput === currentPin) {
    return {
      success: true,
      message: "Login Admin berhasil!",
      role: "ADMIN",
      adminName: "Pengurus KDMP Desa Gulun",
      token: Utilities.base64Encode("ADMIN_AUTH_" + new Date().getTime())
    };
  }

  return {
    success: false,
    message: "PIN Admin salah. Silakan coba lagi!"
  };
}

/**
 * Mengubah PIN Admin
 */
function changeAdminPin(oldPin, newPin) {
  const currentPin = getAdminPin();
  if (String(oldPin).trim() !== currentPin) {
    return { success: false, message: "PIN lama tidak sesuai." };
  }

  if (!newPin || String(newPin).trim().length < 4) {
    return { success: false, message: "PIN baru minimal 4 digit." };
  }

  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.PENGATURAN);
  const values = sheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).toUpperCase() === "ADMIN_PIN") {
      sheet.getRange(i + 1, 2).setValue(String(newPin).trim());
      found = true;
      break;
    }
  }

  if (!found) {
    sheet.appendRow(["ADMIN_PIN", String(newPin).trim()]);
  }

  return {
    success: true,
    message: "PIN Admin berhasil diperbarui!"
  };
}

/**
 * Mengimpor data anggota dari Spreadsheet Referensi secara AMAN (HANYA MEMBACA, TIDAK MENGUBAH ASLINYA).
 * Menargetkan lembar kerja 'template_simkopdes' sesuai struktur data SIMKOPDES Desa Gulun.
 */
function importMembersFromReference(customRefId, customSheetName) {
  const refId = customRefId || CONFIG.REFERENCE_SHEET_ID;
  const sheetName = customSheetName || "template_simkopdes";
  const refSs = SpreadsheetApp.openById(refId);
  
  // 1. Cari sheet bernama 'template_simkopdes'
  let refSheet = refSs.getSheetByName(sheetName);
  if (!refSheet) {
    // Fallback cerdas: cari sheet yang mengandung nama simkopdes atau ambil sheet pertama
    const allSheets = refSs.getSheets();
    refSheet = allSheets.find(s => s.getName().toLowerCase().includes("simkopdes")) || allSheets[0];
  }

  const refData = refSheet.getDataRange().getValues();
  if (refData.length <= 1) {
    return { success: false, message: `Sheet '${refSheet.getName()}' kosong atau tidak terbaca.` };
  }

  // 2. Deteksi index kolom dari header baris pertama
  const headerRow = refData[0].map(h => String(h || "").trim().toLowerCase());
  let nikIdx = headerRow.findIndex(h => h.includes("nik"));
  let namaIdx = headerRow.findIndex(h => h.includes("nama"));
  let phoneIdx = headerRow.findIndex(h => h.includes("phone") || h.includes("hp") || h.includes("wa"));
  let alamatIdx = headerRow.findIndex(h => h.includes("alamat"));
  let pekerjaanIdx = headerRow.findIndex(h => h.includes("pekerjaan"));
  let jkIdx = headerRow.findIndex(h => h.includes("jenis kelamin") || h.includes("kelamin"));

  // Default fallback index untuk template_simkopdes jika header berbeda format
  if (nikIdx === -1) nikIdx = 0;
  if (namaIdx === -1) namaIdx = 1;
  if (phoneIdx === -1) phoneIdx = 3;
  if (pekerjaanIdx === -1) pekerjaanIdx = 7;
  if (alamatIdx === -1) alamatIdx = 8;
  if (jkIdx === -1) jkIdx = 4;

  const db = getDatabase();
  const targetSheet = db.getSheetByName(CONFIG.SHEETS.ANGGOTA);
  
  // 3. Baca baris data anggota yang sudah ada untuk mencegah duplikasi data
  const existingValues = targetSheet.getDataRange().getValues();
  const existingMap = new Map();
  for (let i = 1; i < existingValues.length; i++) {
    const nik = String(existingValues[i][1]).trim();
    const nama = String(existingValues[i][3]).trim().toUpperCase();
    if (nik && nik !== "-") existingMap.set(nik, true);
    if (nama) existingMap.set(nama, true);
  }

  const rowsToAdd = [];
  let currentCount = existingValues.length - 1;

  // 4. Proses baris data (lewati baris header ke-0)
  for (let r = 1; r < refData.length; r++) {
    const row = refData[r];
    const rawNama = String(row[namaIdx] || "").trim();
    if (!rawNama) continue;

    const rawNik = String(row[nikIdx] || "").trim();
    let rawPhone = String(row[phoneIdx] || "").trim();
    const rawAlamat = String(row[alamatIdx] || "").trim();
    const rawPekerjaan = String(row[pekerjaanIdx] || "").trim();
    const rawJk = String(row[jkIdx] || "").trim();

    // Format nomor WhatsApp (tambahkan awalan jika perlu)
    if (rawPhone && rawPhone.startsWith("62")) {
      rawPhone = "+" + rawPhone;
    }

    // Cek duplikasi berdasarkan NIK atau Nama Lengkap
    if (rawNik && rawNik !== "-" && existingMap.has(rawNik)) continue;
    if (existingMap.has(rawNama.toUpperCase())) continue;

    currentCount++;
    const memberId = "MBR-" + ("000" + currentCount).slice(-3);

    // Bangun catatan profil tambahan
    let catatanArr = [];
    if (rawPekerjaan) catatanArr.push(`Pekerjaan: ${rawPekerjaan}`);
    if (rawJk) catatanArr.push(`JK: ${rawJk}`);
    catatanArr.push(`Sumber: ${refSheet.getName()}`);

    rowsToAdd.push([
      memberId,
      rawNik || "-",
      "-", // No KK
      rawNama,
      rawAlamat || "-",
      rawPhone || "-",
      "AKTIF",
      0, // total_beli_kumulatif
      0, // total_beli_bulan_ini
      "", // tgl_terakhir_beli
      catatanArr.join(" | ")
    ]);

    if (rawNik && rawNik !== "-") existingMap.set(rawNik, true);
    existingMap.set(rawNama.toUpperCase(), true);
  }

  if (rowsToAdd.length > 0) {
    targetSheet.getRange(targetSheet.getLastRow() + 1, 1, rowsToAdd.length, 11).setValues(rowsToAdd);
  }

  return {
    success: true,
    message: `Berhasil mengimpor ${rowsToAdd.length} anggota dari sheet '${refSheet.getName()}' Desa Gulun.`,
    sheetSource: refSheet.getName(),
    totalImported: rowsToAdd.length,
    totalMembersNow: targetSheet.getLastRow() - 1
  };
}
