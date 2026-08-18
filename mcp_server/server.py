"""
Model Context Protocol (MCP) Server - Python FastMCP
Sistem Penjualan & Antrian Gas LPG KDMP Desa Gulun
"""

import os
import requests
from mcp.server.fastmcp import FastMCP

# URL Google Apps Script Web App (Diperoleh setelah Deploy Web App)
GAS_WEBAPP_URL = os.environ.get("GAS_WEBAPP_URL", "")

mcp = FastMCP("Gas-KDMP-Gulun")

def call_gas_api(action: str, **kwargs):
    if not GAS_WEBAPP_URL:
        return {"success": False, "message": "GAS_WEBAPP_URL environment variable belum disetel."}
    
    payload = {"action": action, **kwargs}
    try:
        res = requests.post(GAS_WEBAPP_URL, json=payload, timeout=30)
        return res.json()
    except Exception as e:
        return {"success": False, "message": f"Koneksi ke Apps Script gagal: {str(e)}"}

@mcp.tool()
def get_dashboard_analytics():
    """Mendapatkan ringkasan KPI dan analitik distribusi kuota gas LPG KDMP Desa Gulun (Total Anggota, Realisasi 100 Tabung, Jumlah Terlayani)."""
    return call_gas_api("getDashboardSummary")

@mcp.tool()
def get_current_batches():
    """Mengambil daftar batch jadwal pengiriman gas (Jumat sore) beserta status stok."""
    return call_gas_api("getBatches")

@mcp.tool()
def create_new_batch(tgl_jadwal: str, waktu_kirim: str = "16:00 WIB", jumlah_stok: int = 25):
    """Membuat jadwal batch pengiriman gas baru untuk hari Jumat.
    Args:
        tgl_jadwal: Tanggal pengiriman format YYYY-MM-DD (Contoh: '2026-08-21')
        waktu_kirim: Jam kedatangan gas (Default: '16:00 WIB')
        jumlah_stok: Kuota tabung dalam batch (Default: 25)
    """
    return call_gas_api("createBatch", tglJadwal=tgl_jadwal, waktuKirim=waktu_kirim, jumlahStok=jumlah_stok)

@mcp.tool()
def generate_queue_batch(batch_id: str, quota_limit: int = 25):
    """Meng-generate antrian 25 anggota secara otomatis dengan algoritma prioritas berkeadilan.
    Args:
        batch_id: ID Batch (Contoh: 'BATCH-20260821-01')
        quota_limit: Jumlah kuota antrian (Default: 25)
    """
    return call_gas_api("generateBatchQueue", batchId=batch_id, quotaLimit=quota_limit)

@mcp.tool()
def get_batch_queue(batch_id: str):
    """Melihat daftar 25 anggota pada antrian batch tertentu beserta status pengambilannya."""
    return call_gas_api("getQueueByBatch", batchId=batch_id)

@mcp.tool()
def swap_queue_position(queue_id_1: str, queue_id_2: str):
    """Menukar nomor urut antrian antara dua anggota di lapangan jika ada yang ingin mengambil duluan."""
    return call_gas_api("swapQueuePosition", queueId1=queue_id_1, queueId2=queue_id_2)

@mcp.tool()
def replace_queue_member(queue_id: str, new_member_id: str, reason: str = "Penyesuaian lapangan"):
    """Mengganti penerima gas pada antrian (jatah dialihkan) dan mencatat transaksi ke pembeli aktual."""
    return call_gas_api("replaceQueueMember", queueId=queue_id, newMemberId=new_member_id, reason=reason)

@mcp.tool()
def confirm_gas_pickup(queue_id: str, payment_method: str = "TUNAI", collector_name: str = "", price: int = 20000):
    """Kasir 1-Klik: Mencatat konfirmasi bahwa gas telah diambil dan dibayar."""
    return call_gas_api("confirmPickupAndPayment", queueId=queue_id, paymentMethod=payment_method, collectorName=collector_name, price=price)

@mcp.tool()
def get_member_purchase_report(search: str = "", unserved_only: bool = False):
    """Mencari rekapitulasi data anggota dan jumlah gas yang sudah dibeli."""
    return call_gas_api("getAllMembers", options={"search": search, "unservedOnly": unserved_only})

@mcp.tool()
def register_new_member(nama_lengkap: str, no_ktp: str = "-", rt_rw: str = "-", no_whatsapp: str = "-"):
    """Mendaftarkan anggota baru Koperasi Desa Merah Putih Desa Gulun."""
    return call_gas_api("addMember", nama_lengkap=nama_lengkap, no_ktp=no_ktp, rt_rw=rt_rw, no_whatsapp=no_whatsapp)

@mcp.tool()
def sync_reference_members():
    """Menyalin data anggota dari sheet template_simkopdes pada Spreadsheet Referensi Desa Gulun secara aman ke database."""
    return call_gas_api("importReferenceMembers", sheetName="template_simkopdes")

@mcp.tool()
def record_wa_sent(queue_id: str):
    """Mencatat waktu pengiriman WhatsApp pengingat ke anggota pada slot antrian tertentu."""
    return call_gas_api("recordWaSent", queueId=queue_id)

if __name__ == "__main__":
    mcp.run()
