const express = require('express');
const path = require('path');
const { google } = require('googleapis');

const app = express();

/* =====================
   KONFIGURASI SERVER
===================== */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

/* =====================
   GOOGLE SHEETS
===================== */
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
});

/* =====================
   HELPER
===================== */
function convertDriveLink(url) {
    if (!url) return 'https://via.placeholder.com/400x300?text=No+Image';
    if (url.includes('drive.google.com')) {
        const id = url.match(/\/d\/(.+?)(\/|$)/);
        if (id) {
            return `https://drive.google.com/thumbnail?id=${id[1]}&sz=w1000`;
        }
    }
    return url;
}

async function getSheetData(rangeName) {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: rangeName,
    });

    return res.data.values || [];
}

/* =====================
   ROUTES
===================== */
// 👉 SEMUA ROUTE KAMU PINDAH KE SINI
// '/', '/profil/:slug', '/berita/:id', '/potensi/:kategori'
// (isinya TETAP, tidak aku ulangi biar tidak kepanjangan)

module.exports = app;
