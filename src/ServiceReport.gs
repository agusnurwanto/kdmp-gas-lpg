/**
 * ==============================================================================
 * ServiceReport.gs - Layanan Laporan, Dashboard, dan Analitik KDMP Desa Gulun
 * ==============================================================================
 */

/**
 * Mengambil ringkasan indikator kinerja utama (KPI) Dashboard
 */
function getDashboardSummary() {
  const members = getAllMembers();
  const batches = getAllBatches();

  const totalMembers = members.length;
  const activeMembers = members.filter(m => m.status_aktif === "AKTIF").length;
  
  // Anggota yang sudah menerima vs belum menerima gas bulan ini
  const servedMembers = members.filter(m => m.status_aktif === "AKTIF" && m.total_beli_bulan_ini > 0);
  const unservedMembers = members.filter(m => m.status_aktif === "AKTIF" && m.total_beli_bulan_ini === 0);

  // Total tabung terdistribusi bulan ini
  const totalGasDistributedMonth = members.reduce((sum, m) => sum + (m.total_beli_bulan_ini || 0), 0);
  const monthlyTargetQuota = CONFIG.MONTHLY_QUOTA;
  const remainingMonthlyQuota = Math.max(0, monthlyTargetQuota - totalGasDistributedMonth);

  // Rekap per RT/RW
  const rtRwStats = {};
  members.forEach(m => {
    const key = m.rt_rw || "Lainnya";
    if (!rtRwStats[key]) {
      rtRwStats[key] = { total: 0, served: 0, unserved: 0 };
    }
    rtRwStats[key].total++;
    if (m.total_beli_bulan_ini > 0) {
      rtRwStats[key].served++;
    } else {
      rtRwStats[key].unserved++;
    }
  });

  return {
    success: true,
    totalMembers: totalMembers,
    activeMembers: activeMembers,
    monthlyTargetQuota: monthlyTargetQuota,
    totalGasDistributedMonth: totalGasDistributedMonth,
    remainingMonthlyQuota: remainingMonthlyQuota,
    servedCountMonth: servedMembers.length,
    unservedCountMonth: unservedMembers.length,
    fulfillmentPercentage: totalMembers > 0 ? Math.round((servedMembers.length / totalMembers) * 100) : 0,
    quotaFulfillmentPercentage: Math.round((totalGasDistributedMonth / monthlyTargetQuota) * 100),
    recentBatches: batches,  // Semua batch untuk dropdown filter publik
    rtRwBreakdown: rtRwStats
  };
}

/**
 * Mengambil laporan rekapitulasi data anggota untuk ekspor / tampilan tabel
 */
function getMemberReportTable(options) {
  const members = getAllMembers(options);
  return {
    success: true,
    total: members.length,
    data: members
  };
}
