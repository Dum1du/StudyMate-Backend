import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { fileURLToPath } from 'url';
import cors from "cors";
import admin from "firebase-admin";
import { google } from "googleapis";
import {dirname, join} from "path";
import { Readable } from "stream";
import fs from "fs";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 4. Initialize Firebase using the absolute path
admin.initializeApp({
    credential: admin.credential.cert(join(__dirname, '..', process.env.FIREBASE_SERVICE_ACCOUNT_PATH)),
});

const db = admin.firestore();

// ✅ Google Drive setup
const auth = new google.auth.GoogleAuth({
  keyFile: "drive-service-account.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const authClient = await auth.getClient();
const drive = google.drive({version: "v3", auth:authClient});

// ✅ Multer setup for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "image/jpeg",
      "image/png",
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Only PDF, Word, and image files are allowed"));
    }
    cb(null, true);
  },
});

// ✅ Middleware: Verify Firebase User
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send("Missing or invalid token");
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).send("Unauthorized");
  }
}

// // ✅ Function: Create folder dynamically
// async function createFolder(folderName, parentFolderId) {
//   const fileMetadata = {
//     name: folderName,
//     mimeType: "application/vnd.google-apps.folder",
//     parents: [parentFolderId],
//   };
//   const res = await drive.files.create({
//     resource: fileMetadata,
//     fields: "id, name",

//     supportsAllDrives:true,
//   });
//   return res.data.id;
// }

// ✅ Function: Upload file to Google Drive
async function uploadFileToDrive(file) {
    const bufferStream = new Readable();
  bufferStream.push(file.buffer);
  bufferStream.push(null); // End the stream

  const res = drive.files.create({
    requestBody: {
      name: file.originalname,
      parents: ["1F-keYuGsk7VLVW_nwC4CvJpb2enkWTTD"],
    },
    media: {
      mimeType: file.mimetype,
      body: bufferStream,
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });
  return res.data;
}

// ✅ Upload endpoint
app.post("/upload", verifyFirebaseToken, upload.single("file"), async (req, res) => {
  try {
    const { resourceTitle, description, courseCode, courseSubject, tags, materialType } = req.body;
    const { file } = req;

    if (!file) return res.status(400).send("No file uploaded");

    // 🔹 Extract department prefix (first 3 letters of course code)
    const department = courseCode.substring(0, 3).toUpperCase();

    // // 🔹 Create folder per course if not exists
    // const folderId = await createFolder(department, process.env.DRIVE_PARENT_FOLDER_ID);

    // 🔹 Upload file
    const uploadedFile = await uploadFileToDrive(file, );

    // 🔹 Save metadata to Firestore under dynamic subject collection
await db
  .collection("studyMaterials")      // parent collection
  .doc()                             // optional doc ID for uniqueness (can be auto)
  .collection(courseSubject)         // dynamic collection named after the subject
  .add({
    uploaderUid: req.user.uid,
    uploaderEmail: req.user.email,
    resourceTitle,
    description,
    courseCode,
    courseSubject,
    tags: tags ? tags.split("#").filter(Boolean) : [],
    materialType,
    fileLink: uploadedFile.webViewLink,
    fileId: uploadedFile.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

    res.status(200).send({ message: "Upload successful", file: uploadedFile, department, });
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

app.listen(process.env.PORT, () =>
  console.log(`🚀 Server running on port ${process.env.PORT}`)
);