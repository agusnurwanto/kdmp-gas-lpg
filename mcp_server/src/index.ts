/**
 * ==============================================================================
 * Model Context Protocol (MCP) Server
 * Sistem Distribusi & Penjualan Gas LPG KDMP Desa Gulun
 * ==============================================================================
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL || "";
const GAS_API_KEY = process.env.GAS_API_KEY || "";

// Helper untuk memanggil API backend Google Apps Script
async function callGasApi(action: string, payload: Record<string, any> = {}) {
  if (!GAS_WEBAPP_URL) {
    throw new Error("Variabel lingkungan 'GAS_WEBAPP_URL' belum disetel di file .env");
  }

  try {
    const response = await axios.post(GAS_WEBAPP_URL, {
      action: action,
      apiKey: GAS_API_KEY,
      ...payload
    }, {
      headers: { "Content-Type": "application/json" },
      maxRedirects: 5
    });

    return response.data;
  } catch (error: any) {
    throw new Error(`Gagal menghubungi Google Apps Script: ${error.message}`);
  }
}

// Inisialisasi Server MCP
const server = new Server(
  {
    name: "gas-kdmp-gulun-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Definisi Tools untuk Agen AI
const TOOLS: Tool[] = [
  {
    name: "get_dashboard_analytics",
    description: "Mendapatkan ringkasan KPI dan analitik distribusi kuota gas LPG KDMP Desa Gulun (Total Anggota, Realisasi Bulan Ini dari 100 Tabung, Jumlah Terlayani, dan Anggota Belum Terlayani).",
    inputSchema: {
      type: "object",
      properties: {},
    }
  },
  {
    name: "get_current_batches",
    description: "Mengambil daftar batch pengiriman gas LPG (termasuk jadwal Jumat sore, stok, dan sisa).",
    inputSchema: {
      type: "object",
      properties: {},
    }
  },
  {
    name: "create_new_batch",
    description: "Membuat jadwal batch pengiriman gas baru untuk hari Jumat.",
    inputSchema: {
      type: "object",
      properties: {
        tglJadwal: {
          type: "string",
          description: "Tanggal pengiriman format YYYY-MM-DD (Contoh: '2026-08-21')"
        },
        waktuKirim: {
          type: "string",
          description: "Waktu pengiriman (Contoh: '16:00 WIB')",
          default: "16:00 WIB"
        },
        jumlahStok: {
          type: "number",
          description: "Jumlah kuota tabung dalam batch (Default: 25)",
          default: 25
        }
      },
      required: ["tglJadwal"]
    }
  },
  {
    name: "generate_queue_batch",
    description: "Meng-generate antrian 25 anggota secara otomatis untuk batch tertentu menggunakan algoritma antrian berkeadilan (mengutamakan yang belum beli bulan ini & paling lama belum beli).",
    inputSchema: {
      type: "object",
      properties: {
        batchId: {
          type: "string",
          description: "ID Batch yang akan digenerate (Contoh: 'BATCH-20260821-01')"
        },
        quotaLimit: {
          type: "number",
          description: "Jumlah kuota antrian yang akan dibuat (Default: 25)",
          default: 25
        }
      },
      required: ["batchId"]
    }
  },
  {
    name: "get_batch_queue",
    description: "Mengambil daftar antrian 1-25 anggota untuk suatu batch beserta status pengambilannya.",
    inputSchema: {
      type: "object",
      properties: {
        batchId: {
          type: "string",
          description: "ID Batch (Contoh: 'BATCH-20260821-01')"
        }
      },
      required: ["batchId"]
    }
  },
  {
    name: "swap_queue_position",
    description: "Menukar nomor urut antrian antara dua anggota di lapangan (misal jika ada yang ingin mengambil duluan).",
    inputSchema: {
      type: "object",
      properties: {
        queueId1: {
          type: "string",
          description: "ID Antrian pertama (Contoh: 'Q-20260821-001')"
        },
        queueId2: {
          type: "string",
          description: "ID Antrian kedua (Contoh: 'Q-20260821-015')"
        }
      },
      required: ["queueId1", "queueId2"]
    }
  },
  {
    name: "replace_queue_member",
    description: "Mengganti penerima gas pada nomor antrian tertentu (misal jatah anggota A dialihkan ke anggota B karena berhalangan). Catatan pembelian akan dicatatkan pada anggota pengganti.",
    inputSchema: {
      type: "object",
      properties: {
        queueId: {
          type: "string",
          description: "ID Antrian yang ingin diganti (Contoh: 'Q-20260821-005')"
        },
        newMemberId: {
          type: "string",
          description: "ID Anggota pengganti yang riil membeli (Contoh: 'MBR-042')"
        },
        reason: {
          type: "string",
          description: "Alasan penggantian / catatan di lapangan"
        }
      },
      required: ["queueId", "newMemberId"]
    }
  },
  {
    name: "confirm_gas_pickup",
    description: "Mencatat konfirmasi bahwa gas LPG telah diambil dan dibayar oleh anggota (Kasir 1-Klik).",
    inputSchema: {
      type: "object",
      properties: {
        queueId: {
          type: "string",
          description: "ID Antrian yang diambil (Contoh: 'Q-20260821-001')"
        },
        paymentMethod: {
          type: "string",
          enum: ["TUNAI", "QRIS", "TRANSFER"],
          description: "Metode pembayaran (Default: 'TUNAI')",
          default: "TUNAI"
        },
        collectorName: {
          type: "string",
          description: "Nama fisik orang yang mengambil gas di lokasi"
        },
        price: {
          type: "number",
          description: "Harga per tabung (Default: 20000)",
          default: 20000
        }
      },
      required: ["queueId"]
    }
  },
  {
    name: "get_member_purchase_report",
    description: "Mencari data anggota dan melihat riwayat jumlah gas yang sudah dibeli (bulan ini & kumulatif) atau menyaring anggota yang belum dapat.",
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Pencarian nama, NIK, atau RT anggota"
        },
        unservedOnly: {
          type: "boolean",
          description: "Setel true jika hanya ingin menampilkan anggota yang BELUM dapat gas bulan ini"
        }
      }
    }
  },
  {
    name: "register_new_member",
    description: "Mendaftarkan anggota baru Koperasi Desa Merah Putih Desa Gulun.",
    inputSchema: {
      type: "object",
      properties: {
        nama_lengkap: { type: "string", description: "Nama lengkap anggota" },
        no_ktp: { type: "string", description: "NIK KTP" },
        rt_rw: { type: "string", description: "RT/RW atau alamat (Contoh: 'RT 02 / RW 01')" },
        no_whatsapp: { type: "string", description: "Nomor kontak WhatsApp" }
      },
      required: ["nama_lengkap"]
    }
  },
  {
    name: "sync_reference_members",
    description: "Menyalin/mengimpor data anggota dari Spreadsheet Referensi Desa Gulun secara aman ke dalam database sistem.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "record_wa_sent",
    description: "Mencatat bahwa pesan WhatsApp pengingat telah dikirimkan ke anggota pada slot antrian tertentu.",
    inputSchema: {
      type: "object",
      properties: {
        queueId: {
          type: "string",
          description: "ID Antrian yang dikirimkan WA (Contoh: 'Q-20260821-001')"
        }
      },
      required: ["queueId"]
    }
  }
];

// Handle List Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle Call Tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: any;

    switch (name) {
      case "get_dashboard_analytics":
        result = await callGasApi("getDashboardSummary");
        break;

      case "get_current_batches":
        result = await callGasApi("getBatches");
        break;

      case "create_new_batch":
        result = await callGasApi("createBatch", args);
        break;

      case "generate_queue_batch":
        result = await callGasApi("generateBatchQueue", args);
        break;

      case "get_batch_queue":
        result = await callGasApi("getQueueByBatch", args);
        break;

      case "swap_queue_position":
        result = await callGasApi("swapQueuePosition", args);
        break;

      case "replace_queue_member":
        result = await callGasApi("replaceQueueMember", args);
        break;

      case "confirm_gas_pickup":
        result = await callGasApi("confirmPickupAndPayment", args);
        break;

      case "get_member_purchase_report":
        result = await callGasApi("getAllMembers", { options: args });
        break;

      case "register_new_member":
        result = await callGasApi("addMember", args);
        break;

      case "sync_reference_members":
        result = await callGasApi("importReferenceMembers", { sheetName: "template_simkopdes" });
        break;

      case "record_wa_sent":
        result = await callGasApi("recordWaSent", args);
        break;

      default:
        throw new Error(`Tool '${name}' tidak dikenali.`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Terjadi kesalahan saat mengeksekusi tool '${name}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Jalankan Server MCP via STDIO
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server Gas KDMP Desa Gulun telah berjalan pada STDIO.");
}

main().catch((err) => {
  console.error("Gagal menjalankan MCP Server:", err);
  process.exit(1);
});
