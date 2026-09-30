/**
 * ==============================================================================
 * ServiceTransaction.gs - Layanan Transaksi & Konfirmasi Pengambilan Gas LPG
 * ==============================================================================
 */

function normalizeSalesImportName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function requireSalesImportSession(sessionToken) {
  if (!sessionToken || !validateSession(sessionToken)) {
    throw new Error("Sesi admin tidak valid atau sudah kedaluwarsa. Silakan login kembali.");
  }
}

function prepareSalesImport(jsonText, fileName) {
  if (!jsonText || String(jsonText).length > 1000000) {
    throw new Error("File JSON kosong atau terlalu besar (maksimal 1 MB).");
  }
  const periodMatch = String(fileName || "").match(/^(0[1-9]|1[0-2])-(20\d{2})\.json$/i);
  if (!periodMatch) {
    throw new Error("Nama file harus menggunakan format MM-YYYY.json, contoh 09-2026.json.");
  }

  let parsed;
  try {
    parsed = JSON.parse(String(jsonText));
  } catch (e) {
    throw new Error("Isi file bukan JSON yang valid. Periksa kembali file sumber.");
  }
  if (!parsed || typeof parsed !== "object" || parsed.success === false) {
    throw new Error("Struktur JSON tidak valid atau file sumber menandai proses gagal.");
  }
  const source = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
  const summary = source.summaryReport;
  const customers = source.customersReport;
  if (!summary || !Array.isArray(customers) || customers.length === 0) {
    throw new Error("JSON harus memiliki summaryReport dan customersReport yang tidak kosong.");
  }

    const sold = summary.sold;
    const gross = summary.gross;
    const modal = summary.modal;
    const profit = summary.profit;
    if (typeof sold !== "number" || !Number.isInteger(sold) || sold <= 0 ||
      typeof gross !== "number" || !Number.isFinite(gross) || gross < 0 ||
      typeof modal !== "number" || !Number.isFinite(modal) || modal < 0 ||
      typeof profit !== "number" || !Number.isFinite(profit) || profit < 0) {
    throw new Error("summaryReport wajib memiliki sold positif serta gross, modal, dan profit berupa angka non-negatif.");
  }

  let quantitySum = 0;
  const seenIds = Object.create(null);
  const period = periodMatch[1] + "-" + periodMatch[2];
  const normalizedCustomers = customers.map(function(customer, index) {
    if (!customer || typeof customer !== "object") {
      throw new Error("Data pelanggan pada baris " + (index + 1) + " tidak valid.");
    }
    const customerReportId = String(customer.customerReportId || "").trim();
    const name = String(customer.name || "").trim();
    const quantity = customer.total;
    const createdAt = String(customer.createdAt || "").trim();
    const createdDate = new Date(createdAt);
    const dateParts = createdAt.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (!customerReportId || seenIds[customerReportId]) {
      throw new Error("customerReportId pada baris " + (index + 1) + " kosong atau duplikat.");
    }
    if (!name) throw new Error("Nama pelanggan pada baris " + (index + 1) + " wajib diisi.");
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Nilai total pada baris " + (index + 1) + " harus bilangan bulat positif.");
    }
    const calendarDate = dateParts ? new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))) : null;
    if (!dateParts || isNaN(createdDate.getTime()) ||
      calendarDate.getUTCFullYear() !== Number(dateParts[1]) ||
      calendarDate.getUTCMonth() !== Number(dateParts[2]) - 1 ||
      calendarDate.getUTCDate() !== Number(dateParts[3])) {
      throw new Error("createdAt pada baris " + (index + 1) + " bukan tanggal ISO yang valid.");
    }
    seenIds[customerReportId] = true;
    quantitySum += quantity;
    return {
      customerReportId: customerReportId,
      nationalityId: String(customer.nationalityId || "").trim(),
      name: name,
      quantity: quantity,
      createdAt: createdDate
    };
  });
  if (quantitySum !== sold) {
    throw new Error("Total kuantitas pelanggan (" + quantitySum + ") tidak sama dengan summaryReport.sold (" + sold + "). Tidak ada data yang diimpor.");
  }

  const db = getDatabase();
  const memberSheet = db.getSheetByName(CONFIG.SHEETS.ANGGOTA);
  const transactionSheet = db.getSheetByName(CONFIG.SHEETS.TRANSAKSI_PENJUALAN);
  if (!memberSheet || !transactionSheet) {
    throw new Error("Sheet ANGGOTA atau TRANSAKSI_PENJUALAN tidak ditemukan. Jalankan setup database terlebih dahulu.");
  }
  const memberValues = memberSheet.getDataRange().getValues();
  const members = [];
  const byNik = Object.create(null);
  const byName = Object.create(null);
  for (let i = 1; i < memberValues.length; i++) {
    const row = memberValues[i];
    const member = {
      id: String(row[0] || "").trim(),
      nik: String(row[1] || "").trim(),
      name: String(row[3] || "").trim(),
      normalizedName: normalizeSalesImportName(row[3])
    };
    if (!member.id || !member.name) continue;
    members.push({ id_anggota: member.id, nama_lengkap: member.name });
    if (/^\d{16}$/.test(member.nik)) {
      if (!byNik[member.nik]) byNik[member.nik] = [];
      byNik[member.nik].push(member);
    }
    if (!byName[member.normalizedName]) byName[member.normalizedName] = [];
    byName[member.normalizedName].push(member);
  }

  const matches = normalizedCustomers.map(function(customer) {
    let memberMatches = [];
    let matchStatus = "unmatched";
    if (/^\d{16}$/.test(customer.nationalityId) && byNik[customer.nationalityId]) {
      memberMatches = byNik[customer.nationalityId];
      if (memberMatches.length === 1) matchStatus = "matched_nik";
      else matchStatus = "ambiguous_nik";
    } else {
      memberMatches = byName[normalizeSalesImportName(customer.name)] || [];
      if (memberMatches.length === 1) matchStatus = "matched_name";
      else if (memberMatches.length > 1) matchStatus = "ambiguous_name";
    }
    return {
      customer: customer,
      matchStatus: matchStatus,
      matchedMemberId: memberMatches.length === 1 ? memberMatches[0].id : "",
      matchedMemberName: memberMatches.length === 1 ? memberMatches[0].name : "",
      candidates: memberMatches.map(function(member) {
        return { id_anggota: member.id, nama_lengkap: member.name };
      })
    };
  });

  const suggestedPrice = gross / sold;
  return {
    period: period,
    summary: { sold: sold, gross: gross, modal: modal, profit: profit },
    suggestedPrice: Number.isInteger(suggestedPrice) ? suggestedPrice : null,
    customers: matches,
    members: members
  };
}

function getSalesImportPreview(jsonText, fileName, sessionToken) {
  requireSalesImportSession(sessionToken);
  const prepared = prepareSalesImport(jsonText, fileName);
  const transactionSheet = getDatabase().getSheetByName(CONFIG.SHEETS.TRANSAKSI_PENJUALAN);
  const existingValues = transactionSheet.getDataRange().getValues();
  const existingIds = Object.create(null);
  for (let i = 1; i < existingValues.length; i++) existingIds[String(existingValues[i][0] || "")] = true;

  const counts = { matched: 0, unmatched: 0, ambiguous: 0, duplicates: 0 };
  const previewCustomers = prepared.customers.map(function(item) {
    const transactionId = createSalesImportTransactionId(prepared.period, item.customer.customerReportId);
    const duplicate = !!existingIds[transactionId];
    if (duplicate) counts.duplicates++;
    if (item.matchStatus === "matched_nik" || item.matchStatus === "matched_name") counts.matched++;
    else if (item.matchStatus.indexOf("ambiguous") === 0) counts.ambiguous++;
    else counts.unmatched++;
    return {
      customerReportId: item.customer.customerReportId,
      name: item.customer.name,
      quantity: item.customer.quantity,
      createdAt: Utilities.formatDate(item.customer.createdAt, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss"),
      matchStatus: item.matchStatus,
      matchedMemberId: item.matchedMemberId,
      matchedMemberName: item.matchedMemberName,
      candidates: item.candidates,
      duplicate: duplicate
    };
  });
  return {
    success: true,
    period: prepared.period,
    summary: prepared.summary,
    suggestedPrice: prepared.suggestedPrice,
    counts: counts,
    customers: previewCustomers,
    members: prepared.members
  };
}

function createSalesImportTransactionId(period, customerReportId) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(period) + "|" + String(customerReportId)
  );
  const hash = bytes.map(function(byte) {
    return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0");
  }).join("").substring(0, 24).toUpperCase();
  return "IMP-" + String(period).replace("-", "") + "-" + hash;
}

function importSalesFromJson(jsonText, fileName, unitPrice, mappingDecisions, sessionToken) {
  requireSalesImportSession(sessionToken);
  const prepared = prepareSalesImport(jsonText, fileName);
  const price = Number(unitPrice);
  if (!Number.isInteger(price) || price <= 0) {
    throw new Error("Harga per tabung wajib dikonfirmasi sebagai bilangan bulat positif.");
  }
  mappingDecisions = mappingDecisions && typeof mappingDecisions === "object" ? mappingDecisions : {};

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const db = getDatabase();
    const transactionSheet = db.getSheetByName(CONFIG.SHEETS.TRANSAKSI_PENJUALAN);
    const memberSheet = db.getSheetByName(CONFIG.SHEETS.ANGGOTA);
    const transactionValues = transactionSheet.getDataRange().getValues();
    const existingIds = Object.create(null);
    for (let i = 1; i < transactionValues.length; i++) existingIds[String(transactionValues[i][0] || "")] = true;

    const memberValues = memberSheet.getDataRange().getValues();
    const memberById = Object.create(null);
    const memberRowById = Object.create(null);
    for (let i = 1; i < memberValues.length; i++) {
      const id = String(memberValues[i][0] || "").trim();
      if (id) {
        memberById[id] = { name: String(memberValues[i][3] || "").trim() };
        memberRowById[id] = i + 1;
      }
    }

    const nowMonth = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM");
    const currentStats = Object.create(null);
    const rowsToAppend = [];
    const insertedByMember = Object.create(null);
    const skippedRows = [];
    let importedUnits = 0;
    let duplicateCount = 0;

    prepared.customers.forEach(function(item) {
      const transactionId = createSalesImportTransactionId(prepared.period, item.customer.customerReportId);
      if (existingIds[transactionId]) {
        duplicateCount++;
        return;
      }

      let memberId = item.matchedMemberId;
      let memberName = item.matchedMemberName;
      const decision = Object.prototype.hasOwnProperty.call(mappingDecisions, item.customer.customerReportId)
        ? mappingDecisions[item.customer.customerReportId]
        : "";
      const explicitMemberId = String(decision || "").trim();
      if (explicitMemberId) {
        if (item.matchStatus === "matched_nik" || item.matchStatus === "matched_name") {
          if (explicitMemberId !== memberId) {
            throw new Error("Mapping manual hanya dapat dipilih untuk pelanggan yang tidak cocok atau ambigu.");
          }
        } else {
          memberId = explicitMemberId;
          memberName = memberById[memberId] ? memberById[memberId].name : "";
        }
      }
      if (!memberId || !memberById[memberId]) {
        skippedRows.push({ name: item.customer.name, status: item.matchStatus });
        return;
      }

      const createdMonth = Utilities.formatDate(item.customer.createdAt, "Asia/Jakarta", "yyyy-MM");
      const createdAt = Utilities.formatDate(item.customer.createdAt, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
      rowsToAppend.push([
        transactionId,
        "",
        "",
        memberId,
        createdAt,
        item.customer.quantity,
        price,
        item.customer.quantity * price,
        "IMPOR_HISTORIS",
        memberName,
        "IMPOR JSON"
      ]);
      importedUnits += item.customer.quantity;
      if (!insertedByMember[memberId]) insertedByMember[memberId] = { quantity: 0, currentMonthQuantity: 0, latestDate: null };
      insertedByMember[memberId].quantity += item.customer.quantity;
      if (createdMonth === nowMonth) insertedByMember[memberId].currentMonthQuantity += item.customer.quantity;
      if (!insertedByMember[memberId].latestDate || item.customer.createdAt > insertedByMember[memberId].latestDate) {
        insertedByMember[memberId].latestDate = item.customer.createdAt;
      }
      existingIds[transactionId] = true;
    });

    if (rowsToAppend.length) {
      transactionSheet.getRange(transactionSheet.getLastRow() + 1, 1, rowsToAppend.length, 11).setValues(rowsToAppend);
    }

    Object.keys(insertedByMember).forEach(function(memberId) {
      const rowIndex = memberRowById[memberId];
      const memberData = memberValues[rowIndex - 1];
      const imported = insertedByMember[memberId];
      const existingLatest = memberData[9] ? new Date(memberData[9]) : null;
      const latestDate = !existingLatest || isNaN(existingLatest.getTime()) || imported.latestDate > existingLatest
        ? Utilities.formatDate(imported.latestDate, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss")
        : memberData[9];
      currentStats[memberId] = [
        Number(memberData[7] || 0) + imported.quantity,
        Number(memberData[8] || 0) + imported.currentMonthQuantity,
        latestDate
      ];
      memberSheet.getRange(rowIndex, 8, 1, 3).setValues([currentStats[memberId]]);
    });

    const importedTotal = importedUnits * price;
    return {
      success: true,
      message: "Impor data penjualan selesai.",
      importedTransactions: rowsToAppend.length,
      importedUnits: importedUnits,
      totalAmount: importedTotal,
      duplicateCount: duplicateCount,
      skippedCount: skippedRows.length,
      skippedCustomers: skippedRows
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Konfirmasi Pengambilan Gas & Pembayaran (1-Klik Kasir)
 * Mencatat transaksi riil dan memperbarui status antrian, stok batch, serta statistik anggota.
 * @param {Object} params - Parameter transaksi. Sertakan params.sessionToken jika dipanggil dari frontend.
 */
function confirmPickupAndPayment(params) {
  params = params || {};
  if (params.sessionToken !== undefined && !validateSession(params.sessionToken)) {
    return { success: false, message: "Unauthorized: Sesi admin tidak valid atau sudah kedaluwarsa.", code: 403 };
  }
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
