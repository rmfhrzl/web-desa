require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const app = express();
const port = 3000;

// --- 1. KONFIGURASI SERVER ---
app.set('view engine', 'ejs');
app.use(express.static('public')); // Folder untuk CSS dan Gambar statis

// --- 2. KONFIGURASI GOOGLE SHEETS API ---
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json', // Pastikan file ini ada
    scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
});

// --- 3. FUNGSI BANTUAN (HELPER) ---

// --- FUNGSI AJAIB (VERSI THUMBNAIL - SEPERTI DI HTML KAMU) ---
function convertDriveLink(url) {
    if (!url) return 'https://via.placeholder.com/400x300?text=No+Image';
    
    url = url.trim();

    // Cek apakah ini link Google Drive
    // Kita pakai Regex yang sama persis dengan HTML kamu agar akurat
    if (url.includes('drive.google.com')) {
        const idMatch = url.match(/\/d\/(.+?)(\/|$)/);
        if (idMatch && idMatch[1]) {
            // INI RAHASIANYA: Pakai endpoint /thumbnail
            // sz=w1000 artinya minta lebar 1000px (kualitas HD)
            return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`;
        }
    }
    
    return url;
}

// Fungsi Ambil Data dari Spreadsheet
async function getSheetData(rangeName) {
    const client = await auth.getClient();
    const googleSheets = google.sheets({ version: 'v4', auth: client });
    
    try {
        const meta = await googleSheets.spreadsheets.values.get({
            auth,
            spreadsheetId: process.env.SPREADSHEET_ID, // ID dari file .env
            range: rangeName, 
        });
        return meta.data.values || [];
    } catch (err) {
        console.error(`ERROR mengambil data ${rangeName}:`, err.message);
        return [];
    }
}

// --- 4. ROUTE (HALAMAN WEBSITE) ---

app.get('/', async (req, res) => {
    console.log("--- REQUEST MASUK KE HOME ---");

    try {
        // A. AMBIL DATA BERITA (Sheet 'berita', Kolom A sampai G)
        const rawBerita = await getSheetData('berita!A2:G');
        
        // Format data array menjadi object agar rapi
        const beritaList = rawBerita.map((row, index) => {
            // Ambil data per kolom (jika kosong diisi string kosong '')
            const judul = row[0] || 'Tanpa Judul';
            const linkGambarAsli = row[5] || '';
            const linkGambarFix = convertDriveLink(linkGambarAsli);

            return {
                index: index,
                judul: judul,
                tanggal: row[1] || '-',
                kategori: row[2] || 'Umum',
                ringkasan: row[3] || '',
                isi: row[4] || '',
                gambar: linkGambarFix, // Gambar sudah otomatis diperbaiki
                headline: (row[6] || '').toLowerCase().trim() // Bersihkan spasi & huruf kecil
            };
        });

        // Pisahkan Berita Headline vs Berita Biasa
        // Cari yang kolom headline-nya 'ya', kalau tidak ada ambil berita pertama
        const headlineNews = beritaList.find(item => item.headline === 'ya') || beritaList[0];
        // Sisa berita (selain headline), ambil maksimal 6 biji
        const recentNews = beritaList.filter(item => item !== headlineNews).slice(0, 6);


        // B. AMBIL DATA KONFIGURASI (Sheet 'config')
        const rawConfig = await getSheetData('config!A2:B');
        const config = {};
        
        rawConfig.forEach(row => {
            if (row[0]) {
                const key = row[0].trim(); // Bersihkan spasi di nama key (misal "foto_kades ")
                const value = row[1];

                // Jika key berhubungan dengan gambar, convert link-nya
                if (key === 'foto_kades' || key === 'logo_desa' || key === 'logo_kabupaten') {
                    config[key] = convertDriveLink(value);
                } else {
                    config[key] = value;
                }
            }
        });

        // C. KIRIM DATA KE TAMPILAN (EJS)
        res.render('home', { 
            title: 'Beranda',
            headline: headlineNews, // Data Berita Utama
            berita: recentNews,     // Data List Berita
            config: config          // Data Profil Desa
        });

    } catch (error) {
        console.error("Error Utama:", error);
        res.send("Maaf, sedang ada gangguan pada server database.");
    }
});
// --- ROUTE: HALAMAN PROFIL (VERSI PERBAIKAN) ---
app.get('/profil/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;
        console.log(`Mencari profil dengan slug: ${slug}`); // DEBUG 1

        // 1. Ambil Config
        const rawConfig = await getSheetData('config!A2:B');
        const config = {};
        rawConfig.forEach(row => {
            if (row[0]) {
                const key = row[0].trim();
                if (key.includes('foto') || key.includes('logo')) {
                    config[key] = convertDriveLink(row[1]);
                } else {
                    config[key] = row[1];
                }
            }
        });

        // 2. Ambil Data Profil
        // Pastikan nama Sheet di Excel benar-benar 'profil_desa'
        const rawProfil = await getSheetData('profil_desa!A2:D');
        console.log("Data Profil dari Excel:", rawProfil); // DEBUG 2
        
        // Cari baris yang kolom slug-nya (index 0) sama dengan URL
        const foundData = rawProfil.find(row => row[0] === slug);

        // JIKA DATA TIDAK KETEMU
        if (!foundData) {
            console.log("GAGAL: Slug tidak ditemukan di Excel."); // DEBUG 3
            // Kita kirim pesan teks saja, jangan render file error
            return res.send(`
                <div style="text-align:center; padding: 50px; font-family: sans-serif;">
                    <h1>404 - Halaman Tidak Ditemukan</h1>
                    <p>Sistem tidak menemukan data untuk profil: <b>${slug}</b></p>
                    <p>Cek Google Spreadsheet Sheet 'profil_desa'. Pastikan kolom A barisnya tertulis: <b>${slug}</b></p>
                    <a href="/">Kembali ke Home</a>
                </div>
            `);
        }

        // JIKA KETEMU
        const profilData = {
            slug: foundData[0],
            judul: foundData[1],
            isi: foundData[2],
            gambar: convertDriveLink(foundData[3])
        };

        res.render('profil', {
            title: profilData.judul,
            data: profilData,
            config: config,
            currentSlug: slug 
        });

    } catch (error) {
        console.error("Error Profil:", error);
        res.send("Terjadi kesalahan sistem di Route Profil.");
    }
});
// --- ROUTE: HALAMAN DETAIL BERITA ---
app.get('/berita/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id); // Ambil nomor urut dari URL

        // 1. Ambil Semua Data Berita Dulu
        const rawBerita = await getSheetData('berita!A2:G');
        
        // Cek jika data tidak ditemukan atau ID ngawur
        if (!rawBerita[id]) {
            return res.send("<h3>Waduh! Berita tidak ditemukan.</h3><a href='/'>Kembali</a>");
        }

        const row = rawBerita[id]; // Ambil baris sesuai nomor urut

        // Rapikan datanya
        const detailBerita = {
            judul: row[0],
            tanggal: row[1],
            kategori: row[2],
            isi: row[4], // Kita butuh Isi Full (Kolom E)
            gambar: convertDriveLink(row[5]) // Pakai fungsi sakti tadi
        };

        // 2. Ambil Config (Buat Navbar tetap jalan)
        const rawConfig = await getSheetData('config!A2:B');
        const config = {};
        rawConfig.forEach(row => {
            const key = row[0] ? row[0].trim() : '';
            if (key === 'foto_kades' || key === 'logo_desa' || key === 'logo_kabupaten') {
                config[key] = convertDriveLink(row[1]);
            } else {
                config[key] = row[1];
            }
        });

        res.render('detail', {
            title: detailBerita.judul,
            berita: detailBerita,
            config: config
        });

    } catch (error) {
        console.error(error);
        res.send("Terjadi kesalahan sistem.");
    }
});
// --- ROUTE PINTAR: MENANGANI PARIWISATA, UMKM, & KESENIAN ---
// --- ROUTE PINTAR: POTENSI (Fixed Column E + Thumbnail) ---
app.get('/potensi/:kategori', async (req, res) => {
    try {
        const kategori = req.params.kategori;
        
        // Validasi kategori
        if (!['pariwisata', 'umkm', 'kesenian'].includes(kategori)) {
            return res.send("Kategori tidak ditemukan.");
        }

        // 1. Ambil Config
        const rawConfig = await getSheetData('config!A2:B');
        const config = {};
        rawConfig.forEach(r => { if(r[0]) config[r[0].trim()] = convertDriveLink(r[1]); });

        // 2. Ambil Data (Sheet Pariwisata/UMKM/Kesenian)
        // Kita ambil data dari Kolom A sampai E
        const sheetName = `${kategori}!A2:E`; 
        const rawData = await getSheetData(sheetName);

        // 3. Format Data
        const listData = rawData.map(row => {
            // DEBUG: Cek link aslinya di terminal
            const linkAsli = row[4]; // Kolom E (Index 4)
            const linkThumbnail = convertDriveLink(linkAsli); // Ubah jadi thumbnail
            
            return {
                nama: row[0] || 'Tanpa Nama',
                deskripsi: row[1] || '-',
                info: row[2] || '', 
                kontak: (row[3] || '').replace(/[^0-9]/g, ''),
                
                // --- BAGIAN PENTING ---
                // Pastikan membaca row[4] (Kolom E)
                // Dan sudah di-convert jadi Thumbnail
                gambar: linkThumbnail 
            };
        });

        res.render('potensi', {
            title: `Potensi ${kategori}`,
            kategori: kategori.charAt(0).toUpperCase() + kategori.slice(1),
            items: listData,
            config: config
        });

    } catch (error) {
        console.error("Error Potensi:", error);
        res.send("Gagal memuat data potensi.");
    }
});

// --- 5. JALANKAN SERVER ---
app.listen(port, () => {
    console.log(`=================================================`);
    console.log(`WEB DESA KKN BERJALAN DI: http://localhost:${port}`);
    console.log(`Pastikan Spreadsheet ID di .env sudah benar.`);
    console.log(`=================================================`);
});