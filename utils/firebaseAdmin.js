// ./utils/firebaseAdmin.js
import admin from '../utils/firebase-admin.js';

const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);


  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

export default admin;