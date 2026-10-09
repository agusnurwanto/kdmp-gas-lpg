/**
 * ==============================================================================
 * ServiceQueue.gs - Generator & Manajemen Antrian Berkeadilan KDMP Desa Gulun
 * ==============================================================================
 */

/**
 * Mengambil daftar seluruh batch pengiriman
 */
function getIndonesianDayName(date) {
  const dayIndex = Number(Utilities.formatDate(new Date(date), "Asia/Jakarta", "u")) % 7;
  return ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][dayIndex];
}

function getAllBatches() {
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.BATCH_PENGIRIMAN);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) return [];

  const batches = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    batches.push({
      id_batch: String(row[0] || ""),
      tgl_jadwal: row[1] ? Utilities.formatDate(new Date(row[1]), "Asia/Jakarta", "yyyy-MM-dd") : "-",
      hari: String(row[2] || (row[1] ? getIndonesianDayName(row[1]) : "-")),
      waktu_kirim: String(row[3] || "16:00 WIB"),
      jumlah_stok: Number(row[4] || 25),
      jumlah_terambil: Number(row[5] || 0),
      sisa_stok: Number(row[6] || 0),
      status_batch: String(row[7] || "DRAFT")
    });
  }

  // Urutkan batch terbaru di atas
  return batches.reverse();
}

function getQueueMapColumns_(sheet, createIfMissing) {
  let lastColumn = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (header) {
    return String(header || "").trim().toLowerCase();
  });
  const columns = {
    owner: headers.indexOf("map_atas_nama") + 1,
    updatedAt: headers.indexOf("map_diperbarui_pada") + 1,
    memberId: headers.indexOf("map_anggota_id") + 1,
    memberName: headers.indexOf("map_nama_snapshot") + 1
  };

  if (createIfMissing) {
    if (!columns.owner) {
      columns.owner = ++lastColumn;
      sheet.getRange(1, columns.owner).setValue("map_atas_nama")
        .setFontWeight("bold").setBackground("#0284C7").setFontColor("#FFFFFF");
    }
    if (!columns.updatedAt) {
      columns.updatedAt = ++lastColumn;
      sheet.getRange(1, columns.updatedAt).setValue("map_diperbarui_pada")
        .setFontWeight("bold").setBackground("#0284C7").setFontColor("#FFFFFF");
    }
    if (!columns.memberId) {
      columns.memberId = ++lastColumn;
      sheet.getRange(1, columns.memberId).setValue("map_anggota_id")
        .setFontWeight("bold").setBackground("#0284C7").setFontColor("#FFFFFF");
    }
    if (!columns.memberName) {
      columns.memberName = ++lastColumn;
      sheet.getRange(1, columns.memberName).setValue("map_nama_snapshot")
        .setFontWeight("bold").setBackground("#0284C7").setFontColor("#FFFFFF");
    }
  }

  return columns;
}

/**
 * Membuat Batch Pengiriman Baru (Default: Hari Jumat Sore 25 Tabung)
 * @param {string} sessionToken - Token sesi admin dari frontend (opsional, wajib jika dipanggil langsung)
 */
function createBatch(tglJadwalStr, waktuKirim, jumlahStok, sessionToken) {
  if (sessionToken !== undefined && !validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.BATCH_PENGIRIMAN);
  
  let targetDate;
  if (tglJadwalStr) {
    targetDate = new Date(tglJadwalStr);
  } else {
    // Cari hari Jumat berikutnya
    targetDate = new Date();
    const day = targetDate.getDay();
    const diff = (5 - day + 7) % 7; // 5 adalah Jumat
    targetDate.setDate(targetDate.getDate() + (diff === 0 ? 7 : diff));
  }

  const dateCode = Utilities.formatDate(targetDate, "Asia/Jakarta", "yyyyMMdd");
  const tglFormatted = Utilities.formatDate(targetDate, "Asia/Jakarta", "yyyy-MM-dd");
  const hari = getIndonesianDayName(targetDate);
  const batchId = "BATCH-" + dateCode + "-01";

  // Cek apakah batch dengan ID ini sudah ada
  const batches = getAllBatches();
  const exists = batches.some(b => b.id_batch === batchId);
  if (exists) {
    return {
      success: true,
      message: `Batch ${batchId} sudah tersedia.`,
      batchId: batchId
    };
  }

  const stok = Number(jumlahStok) || CONFIG.DEFAULT_QUOTA_PER_BATCH;
  const rowData = [
    batchId,
    tglFormatted,
    hari,
    waktuKirim || "16:00 WIB",
    stok,
    0, // terambil
    stok, // sisa stok
    "DRAFT"
  ];

  sheet.appendRow(rowData);

  return {
    success: true,
    message: `Batch pengiriman baru ${batchId} berhasil dibuat untuk tanggal ${tglFormatted} (${stok} tabung)!`,
    batchId: batchId
  };
}

/**
 * SMART GENERATOR: Meng-generate 25 Anggota Antrian berdasarkan Algoritma Berkeadilan
 * @param {string} sessionToken - Token sesi admin dari frontend
 */
function generateBatchQueue(batchId, quotaLimit, sessionToken) {
  if (sessionToken !== undefined && !validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  const db = getDatabase();

  // 1. Ambil data batch
  const sheetBatch = db.getSheetByName(CONFIG.SHEETS.BATCH_PENGIRIMAN);
  const batchValues = sheetBatch.getDataRange().getValues();
  let batchRowIndex = -1;
  let batchData = null;

  for (let i = 1; i < batchValues.length; i++) {
    if (batchValues[i][0] === batchId) {
      batchRowIndex = i + 1;
      batchData = batchValues[i];
      break;
    }
  }

  if (!batchData) {
    throw new Error(`Batch dengan ID ${batchId} tidak ditemukan.`);
  }
  const quota = Math.floor(Number(batchData[4]) || CONFIG.DEFAULT_QUOTA_PER_BATCH);

  // 2. Cek apakah antrian untuk batch ini sudah ada sebelumnya
  const sheetAntrian = db.getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  const antrianValues = sheetAntrian.getDataRange().getValues();
  const existingInBatch = [];

  for (let i = 1; i < antrianValues.length; i++) {
    if (antrianValues[i][1] === batchId) {
      existingInBatch.push(antrianValues[i]);
    }
  }

  if (existingInBatch.length > 0) {
    return {
      success: true,
      message: `Antrian untuk ${batchId} sudah digenerate sebelumnya (${existingInBatch.length} anggota).`,
      batchId: batchId,
      totalQueue: existingInBatch.length
    };
  }

  // 3. Ambil data anggota aktif
  const sheetAnggota = db.getSheetByName(CONFIG.SHEETS.ANGGOTA);
  const memberValues = sheetAnggota.getDataRange().getValues();
  const candidateMembers = [];

  for (let i = 1; i < memberValues.length; i++) {
    const row = memberValues[i];
    const status = String(row[6] || "AKTIF");
    if (status !== "AKTIF") continue;

    candidateMembers.push({
      id_anggota: String(row[0]),
      nama_lengkap: String(row[3]),
      rt_rw: String(row[4]),
      no_whatsapp: String(row[5]),
      total_beli_kumulatif: Number(row[7] || 0),
      total_beli_bulan_ini: Number(row[8] || 0),
      tgl_terakhir_beli: row[9] ? new Date(row[9]).getTime() : 0 // 0 = belum pernah beli (prioritas paling awal)
    });
  }

  if (candidateMembers.length === 0) {
    throw new Error("Tidak ada anggota aktif yang tersedia untuk dimasukkan ke antrian.");
  }
  if (candidateMembers.length < quota) {
    throw new Error(`Kuota batch ${quota} tabung, tetapi hanya ada ${candidateMembers.length} anggota aktif. Antrian tidak dibuat.`);
  }

  // 4. ALGORITMA SORTING ADIL (FAIR PRIORITY ROUND-ROBIN):
  // 1. total_beli_bulan_ini terendah (0 dulu)
  // 2. tgl_terakhir_beli paling lama / 0 (belum pernah)
  // 3. total_beli_kumulatif terendah
  // 4. id_anggota deterministik
  candidateMembers.sort((a, b) => {
    if (a.total_beli_bulan_ini !== b.total_beli_bulan_ini) {
      return a.total_beli_bulan_ini - b.total_beli_bulan_ini;
    }
    if (a.tgl_terakhir_beli !== b.tgl_terakhir_beli) {
      return a.tgl_terakhir_beli - b.tgl_terakhir_beli; // Yang tanggalnya paling lampau duluan
    }
    if (a.total_beli_kumulatif !== b.total_beli_kumulatif) {
      return a.total_beli_kumulatif - b.total_beli_kumulatif;
    }
    return a.id_anggota.localeCompare(b.id_anggota);
  });

  // 5. Ambil kuota teratas (misal 25 orang)
  const selectedMembers = candidateMembers.slice(0, quota);
  const nowStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
  const newQueueRows = [];

  for (let idx = 0; idx < selectedMembers.length; idx++) {
    const member = selectedMembers[idx];
    const noUrut = idx + 1;
    const queueId = "Q-" + batchId.replace("BATCH-", "") + "-" + ("000" + noUrut).slice(-3);

    newQueueRows.push([
      queueId,
      batchId,
      noUrut,
      member.id_anggota, // id_anggota_asli
      member.id_anggota, // id_anggota_penerima (default sama)
      "MENUNGGU",
      "Auto-generate Sistem Adil (Beli Bulan Ini: " + member.total_beli_bulan_ini + ")",
      nowStr,
      "", // waktu_ambil
      ""  // waktu_terakhir_wa
    ]);
  }

  // 6. Tulis ke sheet ANTRIAN_DISTRIBUSI
  if (newQueueRows.length > 0) {
    sheetAntrian.getRange(sheetAntrian.getLastRow() + 1, 1, newQueueRows.length, 10).setValues(newQueueRows);
  }

  // 7. Update status Batch menjadi ANTRIAN_SIAP
  sheetBatch.getRange(batchRowIndex, 8).setValue("ANTRIAN_SIAP");

  return {
    success: true,
    message: `Berhasil meng-generate antrian berkeadilan untuk ${selectedMembers.length} anggota pada batch ${batchId}!`,
    batchId: batchId,
    totalGenerated: selectedMembers.length,
    selectedMembers: selectedMembers.map((m, i) => ({
      no_urut: i + 1,
      id_anggota: m.id_anggota,
      nama: m.nama_lengkap,
      rt_rw: m.rt_rw,
      beli_bulan_ini: m.total_beli_bulan_ini
    }))
  };
}

/**
 * Mengambil data antrian untuk suatu Batch lengkap dengan nama anggota dan info waktu kirim WA
 */
function getQueueByBatch(batchId, sessionToken) {
  const db = getDatabase();
  const isAdminRequest = !!sessionToken && validateSession(sessionToken);
  const sheetAntrian = db.getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  const mapColumns = getQueueMapColumns_(sheetAntrian, isAdminRequest);
  const antrianValues = sheetAntrian.getDataRange().getValues();
  const transactionSheet = db.getSheetByName(CONFIG.SHEETS.TRANSAKSI_PENJUALAN);
  const transactionValues = transactionSheet ? transactionSheet.getDataRange().getValues() : [];
  const transactionByQueueId = Object.create(null);
  const importedBatchHasMappedTransactions = Object.create(null);
  for (let i = 1; i < transactionValues.length; i++) {
    const transaction = transactionValues[i];
    const queueId = String(transaction[1] || "").trim();
    if (queueId) {
      transactionByQueueId[queueId] = transaction;
      const batchId = String(transaction[2] || "").trim();
      const note = String(transaction[10] || "");
      if (String(transaction[8] || "") === "IMPOR_HISTORIS" && note.indexOf("BELUM_MAPPING") === -1) {
        importedBatchHasMappedTransactions[batchId] = true;
      }
    }
  }

  // Mapping data anggota untuk fast lookup
  const allMembers = getAllMembers_();
  const memberMap = new Map();
  allMembers.forEach(m => memberMap.set(m.id_anggota, m));

  const queueList = [];

  for (let i = 1; i < antrianValues.length; i++) {
    const row = antrianValues[i];
    if (String(row[1] || "").trim() === String(batchId || "").trim()) {
      const idAntrian = String(row[0] || "");
      const transaction = transactionByQueueId[idAntrian];
      const isHistoricalImport = !!transaction && String(transaction[8] || "") === "IMPOR_HISTORIS";
      if (!isAdminRequest && importedBatchHasMappedTransactions[String(batchId || "").trim()] && !isHistoricalImport) continue;
      const idAsli = String(row[3] || "");
      const idPenerima = String(row[4] || "");
      const memberAsli = memberMap.get(idAsli) || { nama_lengkap: idAsli, rt_rw: "-", no_whatsapp: "-" };
      const memberPenerima = memberMap.get(idPenerima) || memberAsli;

      const queueItem = {
        id_batch: String(row[1] || ""),
        no_urut: Number(row[2] || 0),
        nama_anggota_penerima: memberPenerima.nama_lengkap,
        rt_rw_penerima: memberPenerima.rt_rw,
        status_antrian: String(row[5] || "MENUNGGU"),
        waktu_ambil: row[8] ? Utilities.formatDate(new Date(row[8]), "Asia/Jakarta", "yyyy-MM-dd HH:mm") : "-",
        jumlah_tabung: transaction ? Number(transaction[5] || 1) : 1,
        is_replaced: idAsli !== idPenerima,
        is_historical_import: !!transaction && String(transaction[8] || "") === "IMPOR_HISTORIS"
      };

      if (isAdminRequest) {
        queueItem.rowIndex = i + 1;
        queueItem.id_antrian = idAntrian;
        queueItem.id_anggota_asli = idAsli;
        queueItem.nama_anggota_asli = memberAsli.nama_lengkap;
        queueItem.rt_rw_asli = memberAsli.rt_rw;
        queueItem.id_anggota_penerima = idPenerima;
        queueItem.no_ktp_penerima = memberPenerima.no_ktp || "";
        queueItem.no_whatsapp = memberPenerima.no_whatsapp;
        queueItem.map_atas_nama = mapColumns.owner ? String(row[mapColumns.owner - 1] || "") : "";
        queueItem.map_anggota_id = mapColumns.memberId ? String(row[mapColumns.memberId - 1] || "") : "";
        queueItem.map_nama_snapshot = mapColumns.memberName ? String(row[mapColumns.memberName - 1] || "") : "";
        queueItem.map_diperbarui_pada = mapColumns.updatedAt && row[mapColumns.updatedAt - 1]
          ? Utilities.formatDate(new Date(row[mapColumns.updatedAt - 1]), "Asia/Jakarta", "yyyy-MM-dd HH:mm")
          : "";
        queueItem.is_replaced = idAsli !== idPenerima;
        queueItem.keterangan_penyesuaian = String(row[6] || "");
        queueItem.waktu_generate = row[7] ? Utilities.formatDate(new Date(row[7]), "Asia/Jakarta", "yyyy-MM-dd HH:mm") : "-";
        queueItem.waktu_terakhir_wa = row[9] ? Utilities.formatDate(new Date(row[9]), "Asia/Jakarta", "dd/MM HH:mm") : "-";
      }
      queueList.push(queueItem);
    }
  }

  // Urutkan berdasarkan no_urut
  queueList.sort((a, b) => a.no_urut - b.no_urut);

  return queueList;
}

function saveQueueMapRecord(queueId, mapMemberId, sessionToken) {
  if (!validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  const cleanQueueId = String(queueId || "").trim();
  const cleanMemberId = String(mapMemberId || "").trim();
  if (!cleanQueueId) throw new Error("ID antrian wajib diisi.");
  if (!cleanMemberId) throw new Error("Pilih anggota koperasi untuk data MAP.");

  const selectedMember = getAllMembers_().find(function (member) {
    return String(member.id_anggota) === cleanMemberId;
  });
  if (!selectedMember) throw new Error("Anggota terpilih tidak ditemukan atau tidak valid.");

  const sheet = getDatabase().getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  const values = sheet.getDataRange().getValues();
  let queueRow = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === cleanQueueId) {
      queueRow = i + 1;
      break;
    }
  }
  if (queueRow === -1) throw new Error(`Antrian ${cleanQueueId} tidak ditemukan.`);

  const mapColumns = getQueueMapColumns_(sheet, true);
  const updatedAt = new Date();
  sheet.getRange(queueRow, mapColumns.owner).setValue(selectedMember.nama_lengkap);
  sheet.getRange(queueRow, mapColumns.updatedAt).setValue(updatedAt);
  sheet.getRange(queueRow, mapColumns.memberId).setValue(cleanMemberId);
  sheet.getRange(queueRow, mapColumns.memberName).setValue(selectedMember.nama_lengkap);

  return {
    success: true,
    message: "Catatan MAP berhasil disimpan di spreadsheet. Data belum dikirim melalui API MAP.",
    queueId: cleanQueueId,
    map_atas_nama: selectedMember.nama_lengkap,
    map_anggota_id: cleanMemberId,
    map_nama_snapshot: selectedMember.nama_lengkap,
    map_diperbarui_pada: Utilities.formatDate(updatedAt, "Asia/Jakarta", "yyyy-MM-dd HH:mm")
  };
}

/**
 * Mencatat waktu pengiriman pesan WhatsApp pengingat ke anggota
 * @param {string} sessionToken - Token sesi admin dari frontend
 */
function recordWaSent(queueId, sessionToken) {
  if (sessionToken !== undefined && !validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  const values = sheet.getDataRange().getValues();
  const now = new Date();
  const nowStr = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
  const displayStr = Utilities.formatDate(now, "Asia/Jakarta", "dd/MM HH:mm");

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === queueId) {
      sheet.getRange(i + 1, 10).setValue(nowStr);
      return {
        success: true,
        message: "Waktu kirim WA berhasil dicatat.",
        queueId: queueId,
        timestamp: displayStr
      };
    }
  }

  throw new Error(`Antrian ${queueId} tidak ditemukan.`);
}

/**
 * FLEKSIBILITAS: Menukar Posisi / Nomor Urut antara 2 Antrian (Swap Order)
 * @param {string} sessionToken - Token sesi admin dari frontend
 */
function swapQueuePosition(queueId1, queueId2, sessionToken) {
  if (sessionToken !== undefined && !validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  const values = sheet.getDataRange().getValues();

  let rowIdx1 = -1, rowIdx2 = -1;
  let noUrut1 = 0, noUrut2 = 0;

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === queueId1) {
      rowIdx1 = i + 1;
      noUrut1 = values[i][2];
    }
    if (values[i][0] === queueId2) {
      rowIdx2 = i + 1;
      noUrut2 = values[i][2];
    }
  }

  if (rowIdx1 === -1 || rowIdx2 === -1) {
    throw new Error("Salah satu antrian tidak ditemukan.");
  }

  // Tukar nomor urut di Spreadsheet
  sheet.getRange(rowIdx1, 3).setValue(noUrut2);
  sheet.getRange(rowIdx2, 3).setValue(noUrut1);

  // Berikan keterangan penyesuaian
  const ket1 = sheet.getRange(rowIdx1, 7).getValue();
  const ket2 = sheet.getRange(rowIdx2, 7).getValue();
  sheet.getRange(rowIdx1, 7).setValue((ket1 ? ket1 + "; " : "") + `Tukar urutan ke #${noUrut2}`);
  sheet.getRange(rowIdx2, 7).setValue((ket2 ? ket2 + "; " : "") + `Tukar urutan ke #${noUrut1}`);

  return {
    success: true,
    message: `Berhasil menukar nomor urut antrian #${noUrut1} dan #${noUrut2}!`
  };
}

/**
 * FLEKSIBILITAS: Mengganti Anggota Penerima pada Slot Antrian (Replace Member / Delegasi)
 * @param {string} sessionToken - Token sesi admin dari frontend
 */
function replaceQueueMember(queueId, newMemberId, reason, sessionToken) {
  if (!validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  const values = sheet.getDataRange().getValues();

  const newMember = getAllMembers_().find(function (member) {
    return String(member.id_anggota) === String(newMemberId || "").trim();
  });
  if (!newMember) {
    throw new Error(`Anggota baru dengan ID ${newMemberId} tidak ditemukan.`);
  }
  if (newMember.status_aktif !== "AKTIF") {
    throw new Error("Anggota pengganti harus berstatus AKTIF.");
  }

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === queueId) {
      const rowIndex = i + 1;
      const originalMemberId = values[i][3];
      const originalStatus = values[i][5];

      if (originalStatus === "SUDAH_DIAMBIL") {
        throw new Error("Antrian ini sudah diambil, tidak dapat diubah lagi.");
      }

      // Update ID Penerima Aktual
      sheet.getRange(rowIndex, 5).setValue(newMember.id_anggota);
      sheet.getRange(rowIndex, 6).setValue("DIGANTIKAN");
      sheet.getRange(rowIndex, 7).setValue(
        `Jatah dari ${originalMemberId} dialihkan ke ${newMember.nama_lengkap} (${newMember.id_anggota}). Alasan: ${reason || "Penyesuaian lapangan"}`
      );

      return {
        success: true,
        message: `Penerima pada antrian ${queueId} berhasil diganti menjadi ${newMember.nama_lengkap} (${newMember.id_anggota}).`,
        originalMemberId: originalMemberId,
        newMemberId: newMember.id_anggota,
        newMemberName: newMember.nama_lengkap
      };
    }
  }

  throw new Error(`Antrian dengan ID ${queueId} tidak ditemukan.`);
}

function replaceQueueMembersBulk(batchId, mappings, reason, sessionToken) {
  if (!validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  const cleanBatchId = String(batchId || "").trim();
  if (!cleanBatchId) throw new Error("Pilih batch terlebih dahulu.");
  if (!Array.isArray(mappings) || mappings.length === 0) {
    throw new Error("Tidak ada perubahan penerima yang dikirim.");
  }

  const db = getDatabase();
  const queueSheet = db.getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  const queueValues = queueSheet.getDataRange().getValues();
  const batchQueueById = new Map();
  for (let i = 1; i < queueValues.length; i++) {
    if (String(queueValues[i][1] || "").trim() === cleanBatchId) {
      batchQueueById.set(String(queueValues[i][0] || "").trim(), queueValues[i]);
    }
  }

  const activeMemberIds = new Set(getAllMembers_().filter(function (member) {
    return member.status_aktif === "AKTIF";
  }).map(function (member) { return String(member.id_anggota); }));
  const seenQueueIds = new Set();
  const results = mappings.map(function (mapping) {
    const queueId = String(mapping && mapping.queueId || "").trim();
    const newMemberId = String(mapping && mapping.newMemberId || "").trim();
    const queueRow = batchQueueById.get(queueId);
    if (!queueId || !queueRow) {
      return { queueId: queueId, success: false, message: "Slot tidak ditemukan pada batch ini." };
    }
    if (seenQueueIds.has(queueId)) {
      return { queueId: queueId, success: false, message: "Slot duplikat dalam permintaan." };
    }
    seenQueueIds.add(queueId);
    if (!newMemberId || !activeMemberIds.has(newMemberId)) {
      return { queueId: queueId, success: false, message: "Pilih anggota aktif yang valid." };
    }
    if (String(queueRow[4] || "") === newMemberId) {
      return { queueId: queueId, success: true, unchanged: true, message: "Penerima sudah sesuai; tidak ada perubahan." };
    }
    try {
      const result = replaceQueueMember(queueId, newMemberId, reason || "Penggantian penerima masal", sessionToken);
      return { queueId: queueId, success: true, message: result.message, newMemberId: result.newMemberId, newMemberName: result.newMemberName };
    } catch (error) {
      return { queueId: queueId, success: false, message: error && error.message ? error.message : "Penggantian gagal." };
    }
  });

  return {
    success: true,
    message: "Pemetaan penerima batch selesai diproses.",
    results: results
  };
}

/**
 * Membatalkan / Menandai Lewat Antrian
 * @param {string} sessionToken - Token sesi admin dari frontend
 */
function cancelOrSkipQueue(queueId, reason, sessionToken) {
  if (sessionToken !== undefined && !validateSession(sessionToken)) {
    throw new Error("Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.");
  }
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === queueId) {
      const rowIndex = i + 1;
      sheet.getRange(rowIndex, 6).setValue("BATAL_LEWAT");
      sheet.getRange(rowIndex, 7).setValue(reason || "Anggota tidak hadir / dilewati");

      return {
        success: true,
        message: `Antrian ${queueId} telah ditandai batal / dilewati.`
      };
    }
  }

  throw new Error(`Antrian ${queueId} tidak ditemukan.`);
}
