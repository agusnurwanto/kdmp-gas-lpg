/**
 * ==============================================================================
 * Api.gs - REST API Router untuk Integrasi MCP Server & AI Agent
 * ==============================================================================
 */

/**
 * Memproses permintaan API GET
 * - Action publik: tidak butuh auth (getDashboard, getBatches, getQueue, dll.)
 * - Action admin GET: wajib apiKey
 */
function handleApiGet(params) {
  const action = params.action || params.api;
  let result = {};

  // Action publik — boleh diakses siapa saja (read-only, tanpa data sensitif)
  switch (action) {
    case "getDashboard":
    case "getDashboardSummary":
      result = getDashboardSummary();
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);

    case "getAppSettings":
      result = getAppSettings();
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);

    case "getBatches":
      result = { success: true, data: getAllBatches() };
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);

    case "getQueue":
    case "getQueueByBatch":
      if (!params.batchId) {
        result = { success: false, message: "Parameter 'batchId' diperlukan." };
      } else {
        // Data antrian publik: tampilkan nama & no urut, TANPA no WA & NIK
        const rawQueue = getQueueByBatch(params.batchId);
        result = {
          success: true,
          batchId: params.batchId,
          data: rawQueue.map(function(item) {
            return {
              id_antrian: item.id_antrian,
              no_urut: item.no_urut,
              nama_anggota_penerima: item.nama_anggota_penerima,
              rt_rw_penerima: item.rt_rw_penerima,
              status_antrian: item.status_antrian,
              waktu_ambil: item.waktu_ambil
            };
          })
        };
      }
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);

    case "getMember": {
      // Hanya boleh dengan apiKey — data anggota bersifat sensitif (NIK, no WA)
      if (!validateApiKey(params.apiKey)) {
        return ContentService.createTextOutput(JSON.stringify(unauthorizedResponse()))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const member = getMemberById(params.id || params.memberId || params.query);
      result = member
        ? { success: true, data: member }
        : { success: false, message: "Anggota tidak ditemukan." };
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    case "getMembers":
      // Data anggota lengkap (termasuk NIK & WA) — wajib apiKey
      if (!validateApiKey(params.apiKey)) {
        return ContentService.createTextOutput(JSON.stringify(unauthorizedResponse()))
          .setMimeType(ContentService.MimeType.JSON);
      }
      result = {
        success: true,
        data: getAllMembers({
          search: params.search,
          status: params.status,
          unservedOnly: params.unservedOnly
        })
      };
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);

    case "getTransactions":
      // Riwayat transaksi — wajib apiKey
      if (!validateApiKey(params.apiKey)) {
        return ContentService.createTextOutput(JSON.stringify(unauthorizedResponse()))
          .setMimeType(ContentService.MimeType.JSON);
      }
      result = { success: true, data: getAllTransactions(Number(params.limit) || 50) };
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);

    default:
      result = {
        success: false,
        message: `Action '${action}' tidak dikenali. Endpoint API siap digunakan untuk MCP Server.`
      };
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Memproses permintaan API POST dari MCP Server atau Webhook.
 * Semua action write wajib menyertakan apiKey (MCP/REST) atau sessionToken (frontend).
 * Action publik yang diizinkan tanpa auth: loginAdmin.
 */
function handleApiPost(data) {
  const action = data.action;

  // ── Action Publik (tidak butuh auth) ─────────────────────────────────────
  switch (action) {
    case "loginAdmin":
      return loginAdmin(data.pin);

    case "getDashboardSummary":
      return getDashboardSummary();

    case "getAppSettings":
      return getAppSettings();

    case "getQueueByBatch":
      return { success: true, data: getQueueByBatch(data.batchId) };

    case "getAllMembers":
      // Tanpa auth: kembalikan data tanpa info sensitif (no WA, NIK disembunyikan)
      if (!isAuthorized(data)) {
        const publicMembers = getAllMembers(data.options);
        return {
          success: true,
          data: publicMembers.map(function(m) {
            return {
              id_anggota: m.id_anggota,
              nama_lengkap: m.nama_lengkap,
              rt_rw: m.rt_rw,
              status_aktif: m.status_aktif,
              total_beli_bulan_ini: m.total_beli_bulan_ini,
              total_beli_kumulatif: m.total_beli_kumulatif,
              tgl_terakhir_beli: m.tgl_terakhir_beli
            };
          })
        };
      }
      // Dengan auth: kembalikan data lengkap
      return { success: true, data: getAllMembers(data.options) };
  }

  // ── Semua action berikut WAJIB autentikasi ────────────────────────────────
  if (!isAuthorized(data)) {
    return unauthorizedResponse();
  }

  switch (action) {
    case "setupDatabase":
      return setupDatabase(data.spreadsheetId);

    case "importReferenceMembers":
      return importMembersFromReference(data.referenceSheetId, data.sheetName || "template_simkopdes");

    case "createBatch":
      return createBatch(data.tglJadwal, data.waktuKirim, data.jumlahStok);

    case "generateBatchQueue":
      return generateBatchQueue(data.batchId, data.quotaLimit);

    case "swapQueuePosition":
      return swapQueuePosition(data.queueId1, data.queueId2);

    case "replaceQueueMember":
      return replaceQueueMember(data.queueId, data.newMemberId, data.reason);

    case "cancelOrSkipQueue":
      return cancelOrSkipQueue(data.queueId, data.reason);

    case "confirmPickupAndPayment":
      return confirmPickupAndPayment(data);

    case "addMember":
      return addMember(data);

    case "updateMember":
      return updateMember(data.memberId, data);

    case "resetMonthlyQuota":
      return resetMonthlyQuota();

    case "changeAdminPin":
      return changeAdminPin(data.oldPin, data.newPin);

    case "recordWaSent":
      return recordWaSent(data.queueId);

    case "logoutAdmin":
      return logoutAdmin(data.sessionToken);

    default:
      return {
        success: false,
        message: `Action '${action}' tidak dikenali di handleApiPost.`
      };
  }
}
