/**
 * ==============================================================================
 * Api.gs - REST API Router untuk Integrasi MCP Server & AI Agent
 * ==============================================================================
 */

/**
 * Memproses permintaan API GET
 */
function handleApiGet(params) {
  const action = params.action || params.api;
  let result = {};

  switch (action) {
    case "getDashboard":
    case "getDashboardSummary":
      result = getDashboardSummary();
      break;

    case "getAppSettings":
      result = getAppSettings();
      break;

    case "getBatches":
      result = { success: true, data: getAllBatches() };
      break;

    case "getQueue":
      if (!params.batchId) throw new Error("Parameter 'batchId' diperlukan.");
      result = { success: true, batchId: params.batchId, data: getQueueByBatch(params.batchId) };
      break;

    case "getMembers":
      result = {
        success: true,
        data: getAllMembers({
          search: params.search,
          status: params.status,
          unservedOnly: params.unservedOnly
        })
      };
      break;

    case "getMember":
      const member = getMemberById(params.id || params.memberId || params.query);
      result = member ? { success: true, data: member } : { success: false, message: "Anggota tidak ditemukan." };
      break;

    case "getTransactions":
      result = { success: true, data: getAllTransactions(Number(params.limit) || 50) };
      break;

    default:
      result = {
        success: false,
        message: `Action '${action}' tidak dikenali. Endpoint API siap digunakan untuk MCP Server.`
      };
      break;
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Memproses permintaan API POST dari MCP Server atau Webhook
 */
function handleApiPost(data) {
  const action = data.action;

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

    case "getDashboardSummary":
      return getDashboardSummary();

    case "getAppSettings":
      return getAppSettings();

    case "getQueueByBatch":
      return { success: true, data: getQueueByBatch(data.batchId) };

    case "getAllMembers":
      return { success: true, data: getAllMembers(data.options) };

    case "loginAdmin":
      return loginAdmin(data.pin);

    case "changeAdminPin":
      return changeAdminPin(data.oldPin, data.newPin);

    case "recordWaSent":
      return recordWaSent(data.queueId);

    default:
      return {
        success: false,
        message: `Action '${action}' tidak dikenali di handleApiPost.`
      };
  }
}
