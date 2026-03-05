import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import axios from "axios";
import cors from "cors";
import { google } from "googleapis";
import { Readable } from "stream";
import http from "http";
import { Server } from "socket.io";
import {processPdfAndGenerateQuiz}  from "./processPdfAndGenerateQuiz.js";
import {admin, db } from "./firebaseConfig.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
});

// Google Drive integration
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const authClient = await auth.getClient();
const drive = google.drive({ version: "v3", auth: authClient });

//Multer setup
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

//Verify Firebase User 
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

//Upload file to Google Drive
async function uploadFileToDrive(file) {
  const tokenResponse = await authClient.getAccessToken();
  const accessToken = tokenResponse.token;

  const metadata = {
    name: file.originalname,
    parents: ["1wpWywZTCZIh8Jg-DL7wMMpGTnk57y9NV"], //Drive folder ID
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

  return response.data;
}

// Upload endpoint
app.post("/upload", verifyFirebaseToken, upload.single("file"), async (req, res) => {
  try {
    const { file } = req;
    if (!file) return res.status(400).send("No file uploaded");

    // Collect additional fields from
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
        quizStatus: "processing",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("File added to firebase:", file.originalname);
      console.log("File: ", file.originalname);
      if (socket) socket.emit("uploadStatus", { step: "firestore", message: "Metadata saved to Firestore", docId: materialRef.id });

      res.status(200).send({
      message: " Upload successful. Quiz generation in started.",
      file: uploadedFile,
      docId: materialRef.id,
    });

    // 4️⃣ Background processing (NO AWAIT)
    processPdfAndGenerateQuiz(file.buffer, departmentId, materialRef.id, db);

    //All done
      if (socket) socket.emit("uploadStatus", { step: "complete", message: "Upload process complete", fileName: file.originalname, docId: materialRef.id });

    
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).send({ message: error.message });
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
