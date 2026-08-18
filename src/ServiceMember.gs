/**
 * ==============================================================================
 * ServiceMember.gs - Layanan Manajemen Data Anggota KDMP Desa Gulun
 * ==============================================================================
 */

/**
 * Mengambil seluruh data anggota dengan opsi filter dan pencarian
 */
function getAllMembers(options) {
  options = options || {};
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.ANGGOTA);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const members = [];
  const search = (options.search || "").toLowerCase().trim();
  const filterStatus = options.status || "";
  const filterUnserved = options.unservedOnly === true || options.unservedOnly === "true";

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const member = {
      rowIndex: i + 1,
      id_anggota: String(row[0] || ""),
      no_ktp: String(row[1] || ""),
      no_kk: String(row[2] || ""),
      nama_lengkap: String(row[3] || ""),
      rt_rw: String(row[4] || ""),
      no_whatsapp: String(row[5] || ""),
      status_aktif: String(row[6] || "AKTIF"),
      total_beli_kumulatif: Number(row[7] || 0),
      total_beli_bulan_ini: Number(row[8] || 0),
      tgl_terakhir_beli: row[9] ? Utilities.formatDate(new Date(row[9]), "Asia/Jakarta", "yyyy-MM-dd HH:mm") : "-",
      catatan: String(row[10] || "")
    };

    if (!member.nama_lengkap) continue;

    // Filter Pencarian Nama / NIK / RT
    if (search) {
      const matchSearch = member.nama_lengkap.toLowerCase().includes(search) ||
                          member.no_ktp.toLowerCase().includes(search) ||
                          member.id_anggota.toLowerCase().includes(search) ||
                          member.rt_rw.toLowerCase().includes(search);
      if (!matchSearch) continue;
    }

    // Filter Status
    if (filterStatus && member.status_aktif !== filterStatus) {
      continue;
    }

    // Filter Hanya yang Belum Terlayani Bulan Ini
    if (filterUnserved && member.total_beli_bulan_ini > 0) {
      continue;
    }

    members.push(member);
  }

  return members;
}

/**
 * Mengambil detail satu anggota berdasarkan ID atau NIK
 */
function getMemberById(memberIdOrNik) {
  if (!memberIdOrNik) return null;
  const members = getAllMembers();
  const query = String(memberIdOrNik).trim().toLowerCase();
  
  return members.find(m => 
    m.id_anggota.toLowerCase() === query || 
    m.no_ktp.toLowerCase() === query ||
    m.nama_lengkap.toLowerCase() === query
  ) || null;
}

/**
 * Menambahkan anggota baru ke Sheet ANGGOTA
 */
function addMember(data) {
  if (!data.nama_lengkap) {
    throw new Error("Nama lengkap anggota wajib diisi.");
  }

  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.ANGGOTA);
  const lastRow = sheet.getLastRow();
  
  const newId = "MBR-" + ("000" + lastRow).slice(-3);
  const rowData = [
    newId,
    data.no_ktp || "-",
    data.no_kk || "-",
    data.nama_lengkap.trim(),
    data.rt_rw || "-",
    data.no_whatsapp || "-",
    data.status_aktif || "AKTIF",
    0, // total_beli_kumulatif
    0, // total_beli_bulan_ini
    "", // tgl_terakhir_beli
    data.catatan || "Ditambahkan manual"
  ];

  sheet.appendRow(rowData);

  return {
    success: true,
    message: `Anggota ${data.nama_lengkap} (${newId}) berhasil didaftarkan!`,
    memberId: newId
  };
}

/**
 * Memperbarui data anggota
 */
function updateMember(memberId, data) {
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.ANGGOTA);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === memberId) {
      const rowIndex = i + 1;
      if (data.nama_lengkap !== undefined) sheet.getRange(rowIndex, 4).setValue(data.nama_lengkap);
      if (data.rt_rw !== undefined) sheet.getRange(rowIndex, 5).setValue(data.rt_rw);
      if (data.no_whatsapp !== undefined) sheet.getRange(rowIndex, 6).setValue(data.no_whatsapp);
      if (data.status_aktif !== undefined) sheet.getRange(rowIndex, 7).setValue(data.status_aktif);
      if (data.catatan !== undefined) sheet.getRange(rowIndex, 11).setValue(data.catatan);

      return {
        success: true,
        message: `Data anggota ${memberId} berhasil diperbarui.`
      };
    }
  }

  throw new Error(`Anggota dengan ID ${memberId} tidak ditemukan.`);
}

/**
 * Me-reset kuota bulanan anggota (total_beli_bulan_ini = 0) saat pergantian bulan baru
 */
function resetMonthlyQuota() {
  const db = getDatabase();
  const sheet = db.getSheetByName(CONFIG.SHEETS.ANGGOTA);
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return { success: true, message: "Tidak ada data anggota untuk di-reset." };

  const range = sheet.getRange(2, 9, lastRow - 1, 1);
  const zeros = new Array(lastRow - 1).fill([0]);
  range.setValues(zeros);

  return {
    success: true,
    message: `Kuota bulanan untuk ${lastRow - 1} anggota berhasil di-reset untuk bulan baru!`
  };
}
