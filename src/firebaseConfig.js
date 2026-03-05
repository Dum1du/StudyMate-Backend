import admin from "firebase-admin";
import { dirname, join } from "path";
import { fileURLToPath } from 'url';
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(join(__dirname, "..", process.env.FIREBASE_SERVICE_ACCOUNT_PATH)),
});
const db = admin.firestore();

export {admin, db };