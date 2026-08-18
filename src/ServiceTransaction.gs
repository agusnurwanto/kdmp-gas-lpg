/**
 * ==============================================================================
 * ServiceTransaction.gs - Layanan Transaksi & Konfirmasi Pengambilan Gas LPG
 * ==============================================================================
 */

/**
 * Konfirmasi Pengambilan Gas & Pembayaran (1-Klik Kasir)
 * Mencatat transaksi riil dan memperbarui status antrian, stok batch, serta statistik anggota.
 */
function confirmPickupAndPayment(params) {
  params = params || {};
  const queueId = params.queueId || params.id_antrian;
  if (!queueId) {
    throw new Error("ID Antrian (queueId) wajib disertakan.");
  }

  const db = getDatabase();
  const sheetAntrian = db.getSheetByName(CONFIG.SHEETS.ANTRIAN_DISTRIBUSI);
  const antrianValues = sheetAntrian.getDataRange().getValues();

  let queueRowIndex = -1;
  let queueData = null;

  for (let i = 1; i < antrianValues.length; i++) {
    if (antrianValues[i][0] === queueId) {
      queueRowIndex = i + 1;
      queueData = antrianValues[i];
      break;
    }
  }

  if (!queueData) {
    throw new Error(`Antrian ${queueId} tidak ditemukan.`);
  }

  if (queueData[5] === "SUDAH_DIAMBIL") {
    throw new Error(`Antrian ${queueId} sudah berstatus SUDAH_DIAMBIL sebelumnya.`);
  }

  const batchId = queueData[1];
  const originalMemberId = queueData[3];
  const actualBuyerMemberId = queueData[4]; // Member aktual pembeli (jika diswap/replace)
  const now = new Date();
  const nowStr = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
  const dateCode = Utilities.formatDate(now, "Asia/Jakarta", "yyyyMMdd");

  const actualMember = getMemberById(actualBuyerMemberId);
  const memberName = actualMember ? actualMember.nama_lengkap : actualBuyerMemberId;

  // 1. Catat ke sheet TRANSAKSI_PENJUALAN
  const sheetTrx = db.getSheetByName(CONFIG.SHEETS.TRANSAKSI_PENJUALAN);
  const trxCount = sheetTrx.getLastRow();
  const trxId = "TRX-" + dateCode + "-" + ("000" + trxCount).slice(-3);
  const harga = Number(params.price || params.harga_per_tabung) || CONFIG.DEFAULT_PRICE;
  const jumlahTabung = Number(params.jumlah_tabung) || 1;
  const totalBayar = jumlahTabung * harga;
  const metodeBayar = params.paymentMethod || params.metode_bayar || "TUNAI";
  const namaPengambil = params.collectorName || params.nama_pengambil || memberName;
  const petugas = params.officerName || params.petugas_pencatat || "Petugas Koperasi";

  sheetTrx.appendRow([
    trxId,
    queueId,
    batchId,
    actualBuyerMemberId,
    nowStr,
    jumlahTabung,
    harga,
    totalBayar,
    metodeBayar,
    namaPengambil,
    petugas
  ]);

  // 2. Perbarui status di sheet ANTRIAN_DISTRIBUSI
  sheetAntrian.getRange(queueRowIndex, 6).setValue("SUDAH_DIAMBIL");
  sheetAntrian.getRange(queueRowIndex, 9).setValue(nowStr);

  // 3. Perbarui stok di sheet BATCH_PENGIRIMAN
  const sheetBatch = db.getSheetByName(CONFIG.SHEETS.BATCH_PENGIRIMAN);
  const batchValues = sheetBatch.getDataRange().getValues();
  for (let b = 1; b < batchValues.length; b++) {
    if (batchValues[b][0] === batchId) {
      const bRow = b + 1;
      const currentTerambil = Number(batchValues[b][5] || 0) + jumlahTabung;
      const totalStok = Number(batchValues[b][4] || 25);
      const newSisa = Math.max(0, totalStok - currentTerambil);

      sheetBatch.getRange(bRow, 6).setValue(currentTerambil);
      sheetBatch.getRange(bRow, 7).setValue(newSisa);
      if (newSisa === 0) {
        sheetBatch.getRange(bRow, 8).setValue("SELESAI");
      } else {
        sheetBatch.getRange(bRow, 8).setValue("DISTRIBUSI_BERJALAN");
      }
      break;
    }
  }

  // 4. Perbarui data pembelian pada Sheet ANGGOTA untuk PEMBELI AKTUAL
  const sheetAnggota = db.getSheetByName(CONFIG.SHEETS.ANGGOTA);
  const memberValues = sheetAnggota.getDataRange().getValues();
  for (let m = 1; m < memberValues.length; m++) {
    if (memberValues[m][0] === actualBuyerMemberId) {
      const mRow = m + 1;
      const kumulatif = Number(memberValues[m][7] || 0) + jumlahTabung;
      const bulanIni = Number(memberValues[m][8] || 0) + jumlahTabung;

      sheetAnggota.getRange(mRow, 8).setValue(kumulatif);
      sheetAnggota.getRange(mRow, 9).setValue(bulanIni);
      sheetAnggota.getRange(mRow, 10).setValue(nowStr);
      break;
    }
  }

  return {
    success: true,
    message: `Gas LPG berhasil diserahkan kepada ${namaPengambil} (${actualBuyerMemberId})!`,
    trxId: trxId,
    queueId: queueId,
    batchId: batchId,
    memberId: actualBuyerMemberId,
    memberName: memberName,
    amount: totalBayar,
    paymentMethod: metodeBayar,
    time: nowStr
  };
}

/**
 * Mengambil riwayat transaksi terbaru
 */
function getAllTransactions(limit) {
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.TRANSAKSI_PENJUALAN);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) return [];

  const trxs = [];
  const max = limit ? Math.min(values.length - 1, limit) : values.length - 1;

  for (let i = values.length - 1; i >= values.length - max; i--) {
    const row = values[i];
    trxs.push({
      id_transaksi: String(row[0] || ""),
      id_antrian: String(row[1] || ""),
      id_batch: String(row[2] || ""),
      id_anggota: String(row[3] || ""),
      tgl_waktu_transaksi: row[4] ? Utilities.formatDate(new Date(row[4]), "Asia/Jakarta", "yyyy-MM-dd HH:mm") : "-",
      jumlah_tabung: Number(row[5] || 1),
      harga_per_tabung: Number(row[6] || 20000),
      total_bayar: Number(row[7] || 20000),
      metode_bayar: String(row[8] || "TUNAI"),
      nama_pengambil: String(row[9] || ""),
      petugas_pencatat: String(row[10] || "")
    });
  }

  return trxs;
}
