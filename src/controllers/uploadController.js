import { uploadFileToDrive } from "../services/driveService.js";
import { processPdfAndGenerateQuiz } from "../processPdfAndGenerateQuiz.js";
import { admin, db } from "../firebaseConfig.js";

export async function uploadFile(req, res) {
  try {
    const { file } = req;

    if (!file) return res.status(400).send("No file uploaded");

    const {
      resourceTitle,
      description,
      courseCode,
      courseSubject,
      tags,
      materialType
    } = req.body;

    const io = req.app.get("io");

    const socketId = req.headers["x-socket-id"];
    const socket = io.sockets.sockets.get(socketId);

    if (socket)
      socket.emit("uploadStatus", {
        step: "received",
        message: "File received",
      });

    const uploadedFile = await uploadFileToDrive(file);

    if (socket) 
      socket.emit("uploadStatus", { 
    step: "drive", 
    message: "File uploaded to Drive", 
    fileName: file.originalname });

    const departmentId = courseCode.substring(0, 3).toUpperCase();

    const materialRef = await db
      .collection("studyMaterials")
      .doc(departmentId)
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
        fileLink: `https://drive.google.com/file/d/${uploadedFile.id}/view`,
        fileId: uploadedFile.id,
        quizStatus: "processing",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (socket) 
        socket.emit("uploadStatus", { 
      step: "firestore", 
      message: "Metadata saved to Firestore", 
      docId: materialRef.id });

    res.status(200).send({
      message: "Upload successful",
      docId: materialRef.id,
    });

    // background job
    processPdfAndGenerateQuiz(
      file.buffer,
      departmentId,
      materialRef.id,
      db
    );

    if (socket) 
      socket.emit("uploadStatus", { 
    step: "complete", 
    message: "Upload process complete", 
    fileName: file.originalname, 
    docId: materialRef.id 
  });

  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
}