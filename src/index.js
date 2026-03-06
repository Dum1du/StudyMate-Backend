import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import uploadRoutes from "./routes/uploadRoutes.js";

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

app.set("io", io);

//ROUTES
app.use(uploadRoutes);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

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