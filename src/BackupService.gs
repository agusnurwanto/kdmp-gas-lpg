/**
 * Backup and restore for the five application-owned database sheets.
 */
const DATABASE_BACKUP_FORMAT = "kdmp-gas-lpg-database";
const DATABASE_BACKUP_VERSION = 1;

function getDatabaseBackupSheetNames_() {
  return [
    CONFIG.SHEETS.ANGGOTA,
    CONFIG.SHEETS.BATCH_PENGIRIMAN,
    CONFIG.SHEETS.ANTRIAN_DISTRIBUSI,
    CONFIG.SHEETS.TRANSAKSI_PENJUALAN,
    CONFIG.SHEETS.PENGATURAN
  ];
}

function encodeDatabaseBackupValue_(value) {
  if (value instanceof Date) {
    return { __kdmpBackupType: "date", value: value.toISOString() };
  }
  return value;
}

function decodeDatabaseBackupValue_(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.__kdmpBackupType !== "date" || typeof value.value !== "string") {
      throw new Error("Isi backup memuat tipe data yang tidak dikenal.");
    }
    const date = new Date(value.value);
    if (isNaN(date.getTime())) throw new Error("Tanggal pada backup tidak valid.");
    return date;
  }
  if (value === null || ["string", "number", "boolean"].indexOf(typeof value) !== -1) {
    return value;
  }
  throw new Error("Isi backup memuat nilai sel yang tidak valid.");
}

function createDatabaseBackupPayload_() {
  const spreadsheet = getDatabase();
  const sheets = {};
  getDatabaseBackupSheetNames_().forEach(function (name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) throw new Error("Sheet " + name + " tidak ditemukan; backup dibatalkan.");
    sheets[name] = sheet.getDataRange().getValues().map(function (row) {
      return row.map(encodeDatabaseBackupValue_);
    });
  });

  const now = new Date();
  const date = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd");
  const day = getIndonesianDayName(now);
  const safeName = String(getAppSettings().NAMA_KOPERASI || "KDMP")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "KDMP";

  return {
    format: DATABASE_BACKUP_FORMAT,
    version: DATABASE_BACKUP_VERSION,
    createdAt: now.toISOString(),
    spreadsheetId: spreadsheet.getId(),
    sheets: sheets,
    fileName: "Backup_" + safeName + "_" + day + "_" + date + ".json"
  };
}

function createDatabaseBackup(sessionToken) {
  if (!validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  return createDatabaseBackupPayload_();
}

function validateDatabaseBackup_(backup) {
  if (typeof backup === "string") {
    try {
      backup = JSON.parse(backup);
    } catch (error) {
      throw new Error("File backup bukan JSON yang valid.");
    }
  }
  if (!backup || typeof backup !== "object" ||
      backup.format !== DATABASE_BACKUP_FORMAT ||
      backup.version !== DATABASE_BACKUP_VERSION ||
      !backup.sheets || typeof backup.sheets !== "object" || Array.isArray(backup.sheets)) {
    throw new Error("Format atau versi file backup tidak didukung.");
  }

  const requiredHeaders = {};
  requiredHeaders[CONFIG.SHEETS.ANGGOTA] = ["id_anggota", "no_ktp", "no_kk", "nama_lengkap", "rt_rw", "no_whatsapp", "status_aktif", "total_beli_kumulatif", "total_beli_bulan_ini", "tgl_terakhir_beli", "catatan", "alasan_keluar"];
  requiredHeaders[CONFIG.SHEETS.BATCH_PENGIRIMAN] = ["id_batch", "tgl_jadwal", "hari", "waktu_kirim", "jumlah_stok", "jumlah_terambil", "sisa_stok", "status_batch"];
  requiredHeaders[CONFIG.SHEETS.ANTRIAN_DISTRIBUSI] = ["id_antrian", "id_batch", "no_urut", "id_anggota_asli", "id_anggota_penerima", "status_antrian", "keterangan_penyesuaian", "waktu_generate", "waktu_ambil", "waktu_terakhir_wa"];
  requiredHeaders[CONFIG.SHEETS.TRANSAKSI_PENJUALAN] = ["id_transaksi", "id_antrian", "id_batch", "id_anggota", "tgl_waktu_transaksi", "jumlah_tabung", "harga_per_tabung", "total_bayar", "metode_bayar", "nama_pengambil", "petugas_pencatat"];
  requiredHeaders[CONFIG.SHEETS.PENGATURAN] = ["Kunci", "Nilai"];

  const cleanSheets = {};
  getDatabaseBackupSheetNames_().forEach(function (name) {
    const rows = backup.sheets[name];
    if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0])) {
      throw new Error("Sheet " + name + " tidak tersedia atau tidak memiliki header pada backup.");
    }
    const headers = rows[0].map(function (value) { return String(value || "").trim(); });
    const expected = requiredHeaders[name];
    if (expected.some(function (header, index) { return headers[index] !== header; })) {
      throw new Error("Header sheet " + name + " tidak cocok dengan struktur aplikasi.");
    }
    if (rows.some(function (row) { return !Array.isArray(row) || row.length !== headers.length; })) {
      throw new Error("Jumlah kolom pada sheet " + name + " tidak konsisten.");
    }
    cleanSheets[name] = rows.map(function (row) {
      return row.map(decodeDatabaseBackupValue_);
    });
  });
  return cleanSheets;
}

function ensureDatabaseSheetCapacity_(sheet, rowCount, columnCount) {
  if (sheet.getMaxRows() < rowCount) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < columnCount) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columnCount - sheet.getMaxColumns());
  }
}

function restoreDatabaseBackupPayload_(backup) {
  const restoredSheets = validateDatabaseBackup_(backup);
  const spreadsheet = getDatabase();
  const sheetNames = getDatabaseBackupSheetNames_();
  const sheets = {};
  const originalValues = {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("Database sedang diproses. Coba restore kembali beberapa saat lagi.");
  }

  try {
    sheetNames.forEach(function (name) {
      const sheet = spreadsheet.getSheetByName(name);
      if (!sheet) throw new Error("Sheet " + name + " tidak ditemukan; restore dibatalkan.");
      sheets[name] = sheet;
      originalValues[name] = sheet.getDataRange().getValues();
    });
  } catch (error) {
    lock.releaseLock();
    throw error;
  }

  const changedNames = [];
  try {
    sheetNames.forEach(function (name) {
      const values = restoredSheets[name];
      const sheet = sheets[name];
      ensureDatabaseSheetCapacity_(sheet, values.length, values[0].length);
      sheet.clearContents();
      changedNames.push(name);
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    });
  } catch (error) {
    const rollbackErrors = [];
    changedNames.reverse().forEach(function (name) {
      try {
        const sheet = sheets[name];
        const values = originalValues[name];
        if (values.length && values[0].length) {
          ensureDatabaseSheetCapacity_(sheet, values.length, values[0].length);
          sheet.clearContents();
          sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
        } else {
          sheet.clearContents();
        }
      } catch (rollbackError) {
        rollbackErrors.push(name + ": " + rollbackError.message);
      }
    });
    if (rollbackErrors.length) {
      throw new Error("Restore gagal: " + error.message + ". Pemulihan data awal juga gagal pada " + rollbackErrors.join("; "));
    }
    throw new Error("Restore gagal; perubahan yang sempat diterapkan telah dibatalkan. " + error.message);
  } finally {
    lock.releaseLock();
  }

  CacheService.getScriptCache().remove("APP_SETTINGS_PUBLIC_V1");
  return {
    success: true,
    message: "Data backup berhasil dipulihkan.",
    sheets: sheetNames,
    rows: sheetNames.reduce(function (total, name) {
      return total + Math.max(0, restoredSheets[name].length - 1);
    }, 0)
  };
}

function restoreDatabaseBackup(backupJson, sessionToken) {
  if (!validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  return restoreDatabaseBackupPayload_(backupJson);
}
