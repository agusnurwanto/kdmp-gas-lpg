/**
 * Manajemen katalog, stok, dan penjualan produk non-LPG.
 */
const PRODUCT_TYPE_GOODS = "BARANG";
const PRODUCT_TYPE_SERVICE = "LAYANAN";
const PRODUCT_SHEET_HEADERS = {
  PRODUK: ["id_produk", "nama_produk", "kategori", "tipe_produk", "satuan", "harga_jual", "stok", "status_aktif", "dibuat_pada", "diperbarui_pada"],
  BARANG_MASUK: ["id_barang_masuk", "id_produk", "nama_produk", "tgl_waktu", "jumlah", "harga_beli_satuan", "total_beli", "pemasok", "catatan", "petugas"],
  TRANSAKSI_PRODUK: ["id_transaksi", "tgl_waktu", "id_produk", "nama_produk", "tipe_produk", "jumlah", "harga_satuan", "total_bayar", "metode_bayar", "nama_pembeli", "petugas", "jenis_pembeli", "id_anggota"]
};

function requireProductAuthorization_(credentials) {
  const data = typeof credentials === "string" ? { sessionToken: credentials } : (credentials || {});
  if (!validateSession(data.sessionToken) && !validateApiKey(data.apiKey)) {
    throw new Error("Unauthorized: Sesi admin atau API Key tidak valid.");
  }
}

function getProductSheets_() {
  const db = getDatabase();
  const products = db.getSheetByName(CONFIG.SHEETS.PRODUK);
  const stockIn = db.getSheetByName(CONFIG.SHEETS.BARANG_MASUK);
  const sales = db.getSheetByName(CONFIG.SHEETS.TRANSAKSI_PRODUK);
  if (!products || !stockIn || !sales) {
    throw new Error("Sheet produk belum tersedia. Jalankan setupDatabase() terlebih dahulu.");
  }
  [
    { sheet: products, name: CONFIG.SHEETS.PRODUK, headers: PRODUCT_SHEET_HEADERS.PRODUK },
    { sheet: stockIn, name: CONFIG.SHEETS.BARANG_MASUK, headers: PRODUCT_SHEET_HEADERS.BARANG_MASUK }
  ].forEach(function (entry) {
    const actual = entry.sheet.getRange(1, 1, 1, entry.headers.length).getValues()[0];
    if (entry.headers.some(function (header, index) { return String(actual[index] || "").trim() !== header; })) {
      throw new Error("Header sheet " + entry.name + " tidak sesuai. Jalankan setupDatabase() atau pulihkan struktur sheet yang benar.");
    }
  });
  const salesHeaders = PRODUCT_SHEET_HEADERS.TRANSAKSI_PRODUK;
  const salesActual = sales.getRange(1, 1, 1, salesHeaders.length).getValues()[0];
  const legacySalesHeaders = salesHeaders.slice(0, 11);
  if (legacySalesHeaders.some(function (header, index) { return String(salesActual[index] || "").trim() !== header; })) {
    throw new Error("Header sheet TRANSAKSI_PRODUK tidak sesuai. Pulihkan 11 kolom lama sebelum migrasi identitas pembeli.");
  }
  const appendedSalesHeaders = salesActual.slice(11, 13).map(function (header) { return String(header || "").trim(); });
  if (!appendedSalesHeaders[0] && !appendedSalesHeaders[1]) {
    sales.getRange(1, 12, 1, 2).setValues([salesHeaders.slice(11)]).setFontWeight("bold");
  } else if (appendedSalesHeaders[0] !== salesHeaders[11] || appendedSalesHeaders[1] !== salesHeaders[12]) {
    throw new Error("Kolom identitas pembeli sheet TRANSAKSI_PRODUK tidak sesuai. Jangan ubah data; pulihkan header jenis_pembeli dan id_anggota.");
  }
  return { products: products, stockIn: stockIn, sales: sales };
}

function productText_(value, label, required) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  if (required && !text) throw new Error(label + " wajib diisi.");
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function productPositiveInteger_(value, label, allowZero) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new Error(label + (allowZero ? " harus berupa bilangan bulat nol atau lebih." : " harus berupa bilangan bulat lebih dari nol."));
  }
  return number;
}

function productCurrentStock_(value) {
  const stock = Number(value === "" || value === null || value === undefined ? 0 : value);
  if (!Number.isSafeInteger(stock) || stock < 0) {
    throw new Error("Nilai stok produk tidak valid. Periksa sheet PRODUK sebelum melanjutkan.");
  }
  return stock;
}

function productDateString_(value) {
  return value ? Utilities.formatDate(new Date(value), "Asia/Jakarta", "yyyy-MM-dd HH:mm") : "";
}

function productDateValue_(value, label, defaultNow) {
  const input = String(value === undefined || value === null ? "" : value).trim();
  if (!input && defaultNow) return new Date();
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error(label + " wajib diisi dengan tanggal dan waktu yang valid.");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
  if (Utilities.formatDate(date, "Asia/Jakarta", "yyyy-MM-dd'T'HH:mm") !== input) {
    throw new Error(label + " tidak valid.");
  }
  return date;
}

function getProductManagementData(credentials) {
  requireProductAuthorization_(credentials);
  const sheets = getProductSheets_();
  const productRows = sheets.products.getDataRange().getValues();
  const products = [];
  for (let i = 1; i < productRows.length; i++) {
    const row = productRows[i];
    if (!row[0]) continue;
    products.push({
      id_produk: String(row[0]),
      nama_produk: String(row[1] || ""),
      kategori: String(row[2] || ""),
      tipe_produk: String(row[3] || PRODUCT_TYPE_GOODS),
      satuan: String(row[4] || "pcs"),
      harga_jual: Number(row[5] || 0),
      stok: productCurrentStock_(row[6]),
      status_aktif: String(row[7] || "AKTIF"),
      diperbarui_pada: productDateString_(row[9])
    });
  }
  products.sort(function (a, b) {
    return a.nama_produk.localeCompare(b.nama_produk, "id") || a.id_produk.localeCompare(b.id_produk);
  });

  function recentRows_(sheet, kind) {
    const rows = sheet.getDataRange().getValues();
    return rows.slice(1).filter(function (row) { return row[0]; }).reverse().slice(0, 100).map(function (row) {
      if (kind === "stockIn") {
        return {
          id: String(row[0]),
          id_produk: String(row[1] || ""),
          nama_produk: String(row[2] || ""),
          tgl_waktu: productDateString_(row[3]),
          jumlah: Number(row[4] || 0),
          harga_satuan: Number(row[5] || 0),
          total: Number(row[6] || 0),
          pemasok: String(row[7] || ""),
          catatan: String(row[8] || ""),
          petugas: String(row[9] || "")
        };
      }
      return {
        id: String(row[0]),
        tgl_waktu: productDateString_(row[1]),
        id_produk: String(row[2] || ""),
        nama_produk: String(row[3] || ""),
        tipe_produk: String(row[4] || ""),
        jumlah: Number(row[5] || 0),
        harga_satuan: Number(row[6] || 0),
        total: Number(row[7] || 0),
        metode_bayar: String(row[8] || ""),
        nama_pembeli: String(row[9] || ""),
        petugas: String(row[10] || ""),
        jenis_pembeli: String(row[11] || "UMUM"),
        id_anggota: String(row[12] || "")
      };
    });
  }

  const members = getAllMembers_({ status: "AKTIF" }).map(function (member) {
    return { id_anggota: member.id_anggota, nama_lengkap: member.nama_lengkap };
  });
  return {
    products: products,
    members: members,
    stockIn: recentRows_(sheets.stockIn, "stockIn"),
    sales: recentRows_(sheets.sales, "sales")
  };
}

function saveProduct(data) {
  data = data || {};
  requireProductAuthorization_(data);
  const name = productText_(data.nama_produk, "Nama produk", true);
  const category = productText_(data.kategori, "Kategori", true);
  const unit = productText_(data.satuan, "Satuan", true);
  const type = String(data.tipe_produk || "").trim().toUpperCase();
  if ([PRODUCT_TYPE_GOODS, PRODUCT_TYPE_SERVICE].indexOf(type) === -1) {
    throw new Error("Tipe produk harus berupa BARANG atau LAYANAN.");
  }
  const price = productPositiveInteger_(data.harga_jual, "Harga jual", false);
  const active = String(data.status_aktif || "AKTIF").toUpperCase();
  if (["AKTIF", "NONAKTIF"].indexOf(active) === -1) throw new Error("Status produk tidak valid.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Katalog sedang diproses. Coba kembali beberapa saat lagi.");
  try {
    const sheets = getProductSheets_();
    const sheet = sheets.products;
    const values = sheet.getDataRange().getValues();
    const productId = String(data.id_produk || "").trim();
    const duplicate = values.some(function (row, rowIndex) {
      return rowIndex > 0 &&
        String(row[0]) !== productId &&
        String(row[1] || "").trim().toLocaleLowerCase("id") === name.replace(/^'/, "").toLocaleLowerCase("id");
    });
    if (duplicate) throw new Error("Nama produk sudah ada di katalog. Pilih produk yang sudah tersimpan atau gunakan nama yang membedakan variannya.");
    const now = new Date();
    if (productId) {
      const index = values.findIndex(function (row, rowIndex) {
        return rowIndex > 0 && String(row[0]) === productId;
      });
      if (index === -1) throw new Error("Produk yang akan diperbarui tidak ditemukan.");
      const old = values[index];
      const stock = productCurrentStock_(old[6]);
      if (String(old[3]) !== type && (stock > 0 || hasProductHistory_(sheets, productId))) {
        throw new Error("Tipe produk tidak dapat diubah setelah memiliki stok atau riwayat transaksi.");
      }
      sheet.getRange(index + 1, 2, 1, 7).setValues([[
        name, category, type, unit, price, stock, active
      ]]);
      sheet.getRange(index + 1, 10).setValue(now);
      return { success: true, message: "Produk berhasil diperbarui.", id_produk: productId };
    }

    const newId = "PRD-" + Utilities.getUuid().replace(/-/g, "").slice(0, 12).toUpperCase();
    sheet.appendRow([newId, name, category, type, unit, price, 0, active, now, now]);
    return { success: true, message: "Produk berhasil ditambahkan ke katalog.", id_produk: newId };
  } finally {
    lock.releaseLock();
  }
}

function hasProductHistory_(sheets, productId) {
  return [
    { sheet: sheets.stockIn, productColumn: 1 },
    { sheet: sheets.sales, productColumn: 2 }
  ].some(function (entry) {
    const values = entry.sheet.getDataRange().getValues();
    return values.slice(1).some(function (row) { return String(row[entry.productColumn] || "") === productId; });
  });
}

function deleteProduct(data) {
  data = data || {};
  requireProductAuthorization_(data);
  const productId = String(data.id_produk || "").trim();
  if (!productId) throw new Error("ID produk wajib disertakan.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Katalog sedang diproses. Coba kembali beberapa saat lagi.");
  try {
    const sheets = getProductSheets_();
    const values = sheets.products.getDataRange().getValues();
    const index = values.findIndex(function (row, rowIndex) {
      return rowIndex > 0 && String(row[0]) === productId;
    });
    if (index === -1) throw new Error("Produk tidak ditemukan.");
    if (productCurrentStock_(values[index][6]) !== 0 || hasProductHistory_(sheets, productId)) {
      throw new Error("Produk dengan stok atau riwayat tidak dapat dihapus. Ubah statusnya menjadi NONAKTIF.");
    }
    sheets.products.deleteRow(index + 1);
    return { success: true, message: "Produk berhasil dihapus dari katalog." };
  } finally {
    lock.releaseLock();
  }
}

function recordProductStockIn(data) {
  data = data || {};
  requireProductAuthorization_(data);
  const productId = String(data.id_produk || "").trim();
  const quantity = productPositiveInteger_(data.jumlah, "Jumlah barang masuk", false);
  const unitCost = productPositiveInteger_(data.harga_beli_satuan, "Harga beli per satuan", true);
  const entryDate = productDateValue_(data.tgl_waktu, "Waktu barang masuk", true);
  const supplier = productText_(data.pemasok || "", "Pemasok", false);
  const note = productText_(data.catatan || "", "Catatan", false);
  if (!productId) throw new Error("Pilih produk yang akan ditambahkan stoknya.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Stok sedang diproses. Coba kembali beberapa saat lagi.");
  try {
    const sheets = getProductSheets_();
    const values = sheets.products.getDataRange().getValues();
    const index = values.findIndex(function (row, rowIndex) {
      return rowIndex > 0 && String(row[0]) === productId;
    });
    if (index === -1) throw new Error("Produk tidak ditemukan.");
    const product = values[index];
    if (String(product[3]) !== PRODUCT_TYPE_GOODS) throw new Error("Stok barang masuk hanya dapat dicatat untuk produk bertipe BARANG.");
    const oldStock = productCurrentStock_(product[6]);
    const newStock = oldStock + quantity;
    if (!Number.isSafeInteger(newStock)) throw new Error("Jumlah stok melebihi batas yang didukung.");
    if (!Number.isSafeInteger(quantity * unitCost)) throw new Error("Total pembelian barang masuk melebihi batas yang didukung.");

    const now = new Date();
    const stockInId = "IN-" + Utilities.getUuid().replace(/-/g, "").slice(0, 12).toUpperCase();
    const historyRow = sheets.stockIn.getLastRow() + 1;
    try {
      sheets.products.getRange(index + 1, 7).setValue(newStock);
      sheets.products.getRange(index + 1, 10).setValue(now);
      sheets.stockIn.getRange(historyRow, 1, 1, 10).setValues([[
        stockInId, productId, String(product[1]), entryDate, quantity, unitCost,
        quantity * unitCost, supplier, note, productText_(data.petugas || "Petugas Koperasi", "Petugas", true)
      ]]);
    } catch (error) {
      try {
        sheets.products.getRange(index + 1, 7).setValue(oldStock);
        sheets.products.getRange(index + 1, 10).setValue(product[9] || "");
        if (sheets.stockIn.getLastRow() >= historyRow && String(sheets.stockIn.getRange(historyRow, 1).getValue()) === stockInId) {
          sheets.stockIn.deleteRow(historyRow);
        }
      } catch (rollbackError) {
        throw new Error("Barang masuk gagal dan pemulihan stok juga gagal: " + rollbackError.message);
      }
      throw new Error("Barang masuk gagal dicatat; stok tidak berubah. " + error.message);
    }
    return { success: true, message: "Barang masuk dicatat dan stok berhasil diperbarui.", id_barang_masuk: stockInId, stok: newStock };
  } finally {
    lock.releaseLock();
  }
}

function recordProductSale(data) {
  data = data || {};
  requireProductAuthorization_(data);
  const productId = String(data.id_produk || "").trim();
  const quantity = productPositiveInteger_(data.jumlah, "Jumlah penjualan", false);
  const transactionDate = productDateValue_(data.tgl_waktu, "Waktu penjualan", true);
  const paymentMethod = String(data.metode_bayar || "TUNAI").trim().toUpperCase();
  const buyerType = String(data.jenis_pembeli || "UMUM").trim().toUpperCase();
  if (["TUNAI", "QRIS", "TRANSFER"].indexOf(paymentMethod) === -1) throw new Error("Metode pembayaran harus TUNAI, QRIS, atau TRANSFER.");
  if (["UMUM", "ANGGOTA"].indexOf(buyerType) === -1) throw new Error("Jenis pembeli harus UMUM atau ANGGOTA.");
  if (!productId) throw new Error("Pilih produk yang akan dijual.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Penjualan sedang diproses. Coba kembali beberapa saat lagi.");
  try {
    const sheets = getProductSheets_();
    const values = sheets.products.getDataRange().getValues();
    const index = values.findIndex(function (row, rowIndex) {
      return rowIndex > 0 && String(row[0]) === productId;
    });
    if (index === -1) throw new Error("Produk tidak ditemukan.");
    const product = values[index];
    if (String(product[7] || "AKTIF") !== "AKTIF") throw new Error("Produk nonaktif tidak dapat dijual.");
    const type = String(product[3]);
    if ([PRODUCT_TYPE_GOODS, PRODUCT_TYPE_SERVICE].indexOf(type) === -1) throw new Error("Tipe produk pada katalog tidak valid.");
    const oldStock = productCurrentStock_(product[6]);
    if (type === PRODUCT_TYPE_GOODS && oldStock < quantity) throw new Error("Stok tidak mencukupi. Stok tersedia: " + oldStock + ".");
    const price = productPositiveInteger_(data.harga_satuan === undefined || data.harga_satuan === "" ? product[5] : data.harga_satuan, "Harga jual per satuan", false);
    const total = quantity * price;
    if (!Number.isSafeInteger(total)) throw new Error("Total pembayaran melebihi batas yang didukung.");

    const buyer = getProductBuyer_(buyerType, data.id_anggota, data.nama_pembeli);
    const now = new Date();
    const transactionId = "SALE-" + Utilities.getUuid().replace(/-/g, "").slice(0, 12).toUpperCase();
    const historyRow = sheets.sales.getLastRow() + 1;
    const newStock = type === PRODUCT_TYPE_GOODS ? oldStock - quantity : oldStock;
    try {
      if (type === PRODUCT_TYPE_GOODS) {
        sheets.products.getRange(index + 1, 7).setValue(newStock);
        sheets.products.getRange(index + 1, 10).setValue(now);
      }
      sheets.sales.getRange(historyRow, 1, 1, 13).setValues([[
        transactionId, transactionDate, productId, String(product[1]), type, quantity, price, total,
        paymentMethod, buyer.nama, productText_(data.petugas || "Petugas Koperasi", "Petugas", true),
        buyer.jenis, buyer.id_anggota
      ]]);
    } catch (error) {
      try {
        if (type === PRODUCT_TYPE_GOODS) {
          sheets.products.getRange(index + 1, 7).setValue(oldStock);
          sheets.products.getRange(index + 1, 10).setValue(product[9] || "");
        }
        if (sheets.sales.getLastRow() >= historyRow && String(sheets.sales.getRange(historyRow, 1).getValue()) === transactionId) {
          sheets.sales.deleteRow(historyRow);
        }
      } catch (rollbackError) {
        throw new Error("Penjualan gagal dan pemulihan stok juga gagal: " + rollbackError.message);
      }
      throw new Error("Penjualan gagal dicatat; stok tidak berubah. " + error.message);
    }
    return {
      success: true,
      message: "Penjualan berhasil dicatat.",
      id_transaksi: transactionId,
      total_bayar: total,
      stok: newStock
    };
  } finally {
    lock.releaseLock();
  }
}

function getProductBuyer_(buyerType, memberId, buyerName) {
  if (buyerType === "ANGGOTA") {
    const id = String(memberId || "").trim();
    if (!id) throw new Error("Pilih anggota pembeli.");
    const memberSheet = getDatabase().getSheetByName(CONFIG.SHEETS.ANGGOTA);
    if (!memberSheet) throw new Error("Sheet ANGGOTA belum tersedia.");
    const members = memberSheet.getDataRange().getValues();
    for (let i = 1; i < members.length; i++) {
      if (String(members[i][0] || "").trim() !== id) continue;
      if (String(members[i][6] || "AKTIF").toUpperCase() !== "AKTIF") {
        throw new Error("Anggota nonaktif tidak dapat dipilih sebagai pembeli.");
      }
      return {
        jenis: "ANGGOTA",
        id_anggota: id,
        nama: productText_(members[i][3], "Nama anggota", true)
      };
    }
    throw new Error("Anggota yang dipilih tidak ditemukan.");
  }
  return {
    jenis: "UMUM",
    id_anggota: "",
    nama: productText_(buyerName || "Pembeli Umum", "Nama pembeli", true)
  };
}

function findProductRow_(sheets, productId) {
  const values = sheets.products.getDataRange().getValues();
  const index = values.findIndex(function (row, rowIndex) {
    return rowIndex > 0 && String(row[0]) === String(productId);
  });
  if (index < 0) throw new Error("Produk tidak ditemukan: " + productId + ".");
  return { index: index, row: values[index] };
}

function findProductHistoryRow_(sheet, id, label) {
  const values = sheet.getDataRange().getValues();
  const index = values.findIndex(function (row, rowIndex) {
    return rowIndex > 0 && String(row[0] || "") === String(id);
  });
  if (index < 0) throw new Error(label + " tidak ditemukan.");
  return { index: index, row: values[index] };
}

function prepareProductStockChanges_(sheets, deltas) {
  const totals = Object.create(null);
  Object.keys(deltas).forEach(function (id) {
    if (deltas[id]) totals[id] = (totals[id] || 0) + deltas[id];
  });
  return Object.keys(totals).map(function (id) {
    const product = findProductRow_(sheets, id);
    const oldStock = productCurrentStock_(product.row[6]);
    const newStock = oldStock + totals[id];
    if (!Number.isSafeInteger(newStock) || newStock < 0) {
      throw new Error("Stok produk " + String(product.row[1]) + " tidak mencukupi untuk perubahan riwayat. Stok akan menjadi " + newStock + ".");
    }
    return {
      rowIndex: product.index + 1,
      oldStock: oldStock,
      oldUpdatedAt: product.row[9] || "",
      newStock: newStock,
      updatedAt: new Date()
    };
  });
}

function writeProductStockChanges_(sheets, changes, useNewValues) {
  const attempted = [];
  try {
    changes.forEach(function (change) {
      attempted.push(change);
      sheets.products.getRange(change.rowIndex, 7).setValue(useNewValues ? change.newStock : change.oldStock);
      sheets.products.getRange(change.rowIndex, 10).setValue(useNewValues ? change.updatedAt : change.oldUpdatedAt);
    });
  } catch (error) {
    let rollbackError = null;
    attempted.reverse().forEach(function (change) {
      try {
        sheets.products.getRange(change.rowIndex, 7).setValue(change.oldStock);
        sheets.products.getRange(change.rowIndex, 10).setValue(change.oldUpdatedAt);
      } catch (restoreError) {
        rollbackError = restoreError;
      }
    });
    if (rollbackError) throw new Error("Pembaruan stok gagal dan pemulihan sebagian stok juga gagal: " + rollbackError.message);
    throw error;
  }
}

function validateProductStockAdjustment_(value) {
  const adjustment = String(value || "AUTO").trim().toUpperCase();
  if (["AUTO", "MANUAL"].indexOf(adjustment) === -1) {
    throw new Error("Pilihan penyesuaian stok tidak valid.");
  }
  return adjustment;
}

function updateProductHistory(data) {
  data = data || {};
  requireProductAuthorization_(data);
  const kind = String(data.kind || "").trim();
  if (["stockIn", "sales"].indexOf(kind) === -1) throw new Error("Jenis riwayat tidak valid.");
  const id = String(data.id || "").trim();
  if (!id) throw new Error("ID riwayat wajib disertakan.");
  const entryDate = productDateValue_(data.tgl_waktu, "Waktu riwayat", false);
  const quantity = productPositiveInteger_(data.jumlah, "Jumlah", false);
  const productId = String(data.id_produk || "").trim();
  if (!productId) throw new Error("Pilih produk.");
  const stockAdjustment = validateProductStockAdjustment_(data.stock_adjustment);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Riwayat produk sedang diproses. Coba kembali beberapa saat lagi.");
  try {
    const sheets = getProductSheets_();
    const sheet = kind === "stockIn" ? sheets.stockIn : sheets.sales;
    const history = findProductHistoryRow_(sheet, id, "Riwayat");
    const row = history.row;
    const target = findProductRow_(sheets, productId);
    const product = target.row;
    const type = String(product[3] || "");
    let updatedRow;
    const deltas = Object.create(null);

    if (kind === "stockIn") {
      if (type !== PRODUCT_TYPE_GOODS) throw new Error("Barang masuk hanya dapat terkait dengan produk bertipe BARANG.");
      const unitCost = productPositiveInteger_(data.harga_satuan, "Harga beli per satuan", true);
      const supplier = productText_(data.pemasok || "", "Pemasok", false);
      const note = productText_(data.catatan || "", "Catatan", false);
      if (stockAdjustment === "AUTO") {
        deltas[String(row[1])] = (deltas[String(row[1])] || 0) - productPositiveInteger_(row[4], "Jumlah barang masuk lama", false);
        deltas[productId] = (deltas[productId] || 0) + quantity;
      }
      const total = quantity * unitCost;
      if (!Number.isSafeInteger(total)) throw new Error("Total pembelian barang masuk melebihi batas yang didukung.");
      updatedRow = [
        id, productId, String(product[1]), entryDate, quantity, unitCost, total,
        supplier, note, productText_(data.petugas || row[9] || "Petugas Koperasi", "Petugas", true)
      ];
    } else {
      if ([PRODUCT_TYPE_GOODS, PRODUCT_TYPE_SERVICE].indexOf(type) === -1) throw new Error("Tipe produk pada katalog tidak valid.");
      const price = productPositiveInteger_(data.harga_satuan, "Harga jual per satuan", false);
      const total = quantity * price;
      if (!Number.isSafeInteger(total)) throw new Error("Total pembayaran melebihi batas yang didukung.");
      const paymentMethod = String(data.metode_bayar || "").trim().toUpperCase();
      if (["TUNAI", "QRIS", "TRANSFER"].indexOf(paymentMethod) === -1) throw new Error("Metode pembayaran tidak valid.");
      const buyerType = String(data.jenis_pembeli || "UMUM").trim().toUpperCase();
      if (["UMUM", "ANGGOTA"].indexOf(buyerType) === -1) throw new Error("Jenis pembeli tidak valid.");
      const buyer = getProductBuyer_(buyerType, data.id_anggota, data.nama_pembeli);
      if (stockAdjustment === "AUTO") {
        if (String(row[4]) === PRODUCT_TYPE_GOODS) {
          deltas[String(row[2])] = (deltas[String(row[2])] || 0) + productPositiveInteger_(row[5], "Jumlah penjualan lama", false);
        }
        if (type === PRODUCT_TYPE_GOODS) deltas[productId] = (deltas[productId] || 0) - quantity;
      }
      updatedRow = [
        id, entryDate, productId, String(product[1]), type, quantity, price, total,
        paymentMethod, buyer.nama, productText_(data.petugas || row[10] || "Petugas Koperasi", "Petugas", true),
        buyer.jenis, buyer.id_anggota
      ];
    }

    const changes = stockAdjustment === "AUTO" ? prepareProductStockChanges_(sheets, deltas) : [];
    if (changes.length) writeProductStockChanges_(sheets, changes, true);
    try {
      sheet.getRange(history.index + 1, 1, 1, updatedRow.length).setValues([updatedRow]);
    } catch (error) {
      if (changes.length) writeProductStockChanges_(sheets, changes, false);
      throw new Error("Riwayat gagal diperbarui." + (changes.length ? " Stok dipulihkan." : "") + " " + error.message);
    }
    return { success: true, message: "Riwayat berhasil diperbarui." };
  } finally {
    lock.releaseLock();
  }
}

function deleteProductHistory(data) {
  data = data || {};
  requireProductAuthorization_(data);
  const kind = String(data.kind || "").trim();
  if (["stockIn", "sales"].indexOf(kind) === -1) throw new Error("Jenis riwayat tidak valid.");
  const id = String(data.id || "").trim();
  if (!id) throw new Error("ID riwayat wajib disertakan.");
  const stockAdjustment = validateProductStockAdjustment_(data.stock_adjustment);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Riwayat produk sedang diproses. Coba kembali beberapa saat lagi.");
  try {
    const sheets = getProductSheets_();
    const sheet = kind === "stockIn" ? sheets.stockIn : sheets.sales;
    const history = findProductHistoryRow_(sheet, id, "Riwayat");
    const row = history.row;
    const deltas = Object.create(null);
    if (stockAdjustment === "AUTO") {
      if (kind === "stockIn") {
        deltas[String(row[1])] = -productPositiveInteger_(row[4], "Jumlah barang masuk", false);
      } else if (String(row[4]) === PRODUCT_TYPE_GOODS) {
        deltas[String(row[2])] = productPositiveInteger_(row[5], "Jumlah penjualan", false);
      }
    }

    const changes = stockAdjustment === "AUTO" ? prepareProductStockChanges_(sheets, deltas) : [];
    if (changes.length) writeProductStockChanges_(sheets, changes, true);
    try {
      sheet.deleteRow(history.index + 1);
    } catch (error) {
      if (changes.length) writeProductStockChanges_(sheets, changes, false);
      throw new Error("Riwayat gagal dihapus." + (changes.length ? " Stok dipulihkan." : "") + " " + error.message);
    }
    return { success: true, message: "Riwayat berhasil dihapus." };
  } finally {
    lock.releaseLock();
  }
}

function setProductStockManually(data) {
  data = data || {};
  requireProductAuthorization_(data);
  const productId = String(data.id_produk || "").trim();
  if (!productId) throw new Error("ID produk wajib disertakan.");
  if (data.stok === undefined || data.stok === null || String(data.stok).trim() === "") {
    throw new Error("Stok wajib diisi.");
  }
  const stock = productPositiveInteger_(data.stok, "Stok", true);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Stok sedang diproses. Coba kembali beberapa saat lagi.");
  try {
    const sheets = getProductSheets_();
    const product = findProductRow_(sheets, productId);
    if (String(product.row[3]) !== PRODUCT_TYPE_GOODS) {
      throw new Error("Stok manual hanya berlaku untuk produk bertipe BARANG.");
    }
    const rowIndex = product.index + 1;
    const oldStock = productCurrentStock_(product.row[6]);
    const oldUpdatedAt = product.row[9] || "";
    try {
      sheets.products.getRange(rowIndex, 7).setValue(stock);
      sheets.products.getRange(rowIndex, 10).setValue(new Date());
    } catch (error) {
      try {
        sheets.products.getRange(rowIndex, 7).setValue(oldStock);
        sheets.products.getRange(rowIndex, 10).setValue(oldUpdatedAt);
      } catch (rollbackError) {
        throw new Error("Pengaturan stok gagal dan pemulihan stok juga gagal: " + rollbackError.message);
      }
      throw new Error("Stok gagal diatur; nilai lama dipulihkan. " + error.message);
    }
    return { success: true, message: "Stok produk berhasil diatur manual.", stok: stock };
  } finally {
    lock.releaseLock();
  }
}
