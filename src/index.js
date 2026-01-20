import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import axios from "axios";
import { fileURLToPath } from 'url';
import { dirname, join } from "path";
import cors from "cors";
import admin from "firebase-admin";
import { google } from "googleapis";
import { Readable } from "stream";
import http from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(join(__dirname, "..", process.env.FIREBASE_SERVICE_ACCOUNT_PATH)),
});
const db = admin.firestore();

// ✅ Google Drive setup
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const authClient = await auth.getClient();
const drive = google.drive({ version: "v3", auth: authClient });

// ✅ Multer setup
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

// ✅ Upload file to Google Drive
async function uploadFileToDrive(file) {
  const tokenResponse = await authClient.getAccessToken();
  const accessToken = tokenResponse.token;

  const metadata = {
    name: file.originalname,
    parents: ["1wpWywZTCZIh8Jg-DL7wMMpGTnk57y9NV"], // your Drive folder ID
  };

  const boundary = "boundary123";
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.mimetype}\r\n\r\n`
  );
  const postamble = Buffer.from(`\r\n--${boundary}--`);
  const fullStream = Readable.from([preamble, file.buffer, postamble]);

  const response = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    fullStream,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );

  const uploadedFile = response.data;

  // 🆕 Add this: Make the file publicly accessible (no login required)
  await drive.permissions.create({
    fileId: uploadedFile.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return uploadedFile;
}

// ✅ Upload endpoint
app.post("/upload", verifyFirebaseToken, upload.single("file"), async (req, res) => {
  try {
    const { file } = req;
    if (!file) return res.status(400).send("No file uploaded");
    

    // Collect additional fields from req.body
    const { resourceTitle, description, courseCode, courseSubject, tags, materialType } = req.body;
    if (!courseSubject) return res.status(400).send("Missing courseSubject");

    console.log("File received:", file.originalname);

    const socketId = req.headers["x-socket-id"];
    const socket = io.sockets.sockets.get(socketId);

    if (socket) socket.emit("uploadStatus", { step: "received", message: "File received at backend", fileName: file.originalname });

    // Upload file to Drive
    const uploadedFile = await uploadFileToDrive(file);

    if (socket) socket.emit("uploadStatus", { step: "drive", message: "File uploaded to Drive", fileName: file.originalname });

    console.log("File uploaded:", file.originalname);


    const departmentId = courseCode.substring(0, 3).toUpperCase();

    // Reference to department document
const deptDocRef = db.collection("studyMaterials").doc(departmentId);

    // Save metadata to Firestore
    const materialRef = await deptDocRef
      .collection("Materials")
      .add({
        uploaderUid: req.user.uid,
        uploaderEmail: req.user.email,
        resourceTitle,
        description,
        courseCode,
        courseSubject,
        tags: tags ? tags.split("#").filter(Boolean) : [],
        materialType,
        fileLink: uploadedFile?.id ? `https://drive.google.com/file/d/${uploadedFile.id}/view` : null,
        fileId: uploadedFile?.id || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("File added to firebase:", file.originalname);
      console.log("File: ", file.originalname);
      if (socket) socket.emit("uploadStatus", { step: "firestore", message: "Metadata saved to Firestore", docId: materialRef.id });

    // 3️⃣ All done
      if (socket) socket.emit("uploadStatus", { step: "complete", message: "Upload process complete", fileName: file.originalname, docId: materialRef.id });


    res.status(200).send({
      message: "✅ Upload successful",
      file: uploadedFile,
      docId: materialRef.id,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).send({ message: error.message });
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

app.get("/user-uploads", verifyFirebaseToken, async (req, res) => {
  try{
    const uid = req.user.uid;
    
    //search everywhere in materials for user's id
    const snapshot = await db.collectionGroup("Materials")
      .where("uploaderUid", "==", uid)
      .orderBy("createdAt", "desc")
      .get();
    
    const uploads = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      uploads.push({
        id: doc.id,
        resourceTitle: data.resourceTitle,
        courseCode: data.courseCode,
        courseSubject: data.courseSubject,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
      });
    });

    res.status(200).json(uploads);

  } catch (error) {
    console.error("Error fetching user uploads:", error);

    res.status(500).send({ message: error.message });
  }
});

// ✅ DELETE endpoint: Optimized
app.delete("/delete-upload/:docId", verifyFirebaseToken, async (req, res) => {
  try {
    const { docId } = req.params;
    const uid = req.user.uid;

    console.log(`Attempting to delete doc: ${docId} for user: ${uid}`);

    // 1. Efficiently find the document using FieldPath.documentId()
    const querySnapshot = await db.collectionGroup("Materials")
      .where(admin.firestore.FieldPath.documentId(), '==', docId)
      .get();

    if (querySnapshot.empty) {
      return res.status(404).send("File not found");
    }

    const doc = querySnapshot.docs[0];
    const fileData = doc.data();

    // 2. Verify Ownership
    if (fileData.uploaderUid !== uid) {
      return res.status(403).send("You are not authorized to delete this file.");
    }

    // 3. Delete from Google Drive
    if (fileData.fileId) {
      try {
        await drive.files.delete({ fileId: fileData.fileId });
        console.log(`Deleted Drive file: ${fileData.fileId}`);
      } catch (driveErr) {
        console.log("Drive file might already be deleted:", driveErr.message);
      }
    }

    // 4. Delete from Firestore
    await doc.ref.delete();
    console.log(`Deleted Firestore doc: ${docId}`);

    res.status(200).send({ message: "Resource deleted successfully" });

  } catch (error) {
    console.error("Delete operation failed:", error);
    res.status(500).send({ message: error.message });
  }
});