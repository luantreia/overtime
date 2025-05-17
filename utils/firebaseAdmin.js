// ./utils/firebaseAdmin.js
const admin = require('firebase-admin');
const serviceAccount = require('./overtime-dodgeball-firebase-adminsdk-fbsvc-8d1916a051.json'); // ← reemplaza con tu ruta real

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
