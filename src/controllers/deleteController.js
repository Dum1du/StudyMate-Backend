import { admin, db } from "../firebaseConfig.js";
import { deleteFileFromDrive } from "../services/driveService.js";


export const deleteUpload = async (req, res) => {
  try {
    const { docId } = req.params;
    const uid = req.user.uid;
    const {diptId} = req.query;

    console.log(`Attempting to delete doc: ${docId} for user: ${uid}`);

    const docRef = db
      .collection("studyMaterials")
      .doc(diptId)
      .collection("Materials")
      .doc(docId);

    // 1. Efficiently find the document using FieldPath.documentId()
    const docSnap = await docRef.get();
    if (!docSnap.exists) return res.status(404).send("File not found");

    const fileData = docSnap.data();

    // 2. Verify Ownership
    if (fileData.uploaderUid !== uid) {
      return res.status(403).send("You are not authorized to delete this file.");
    }

    // 3. Delete from Google Drive
    if (fileData.fileId) {
      try {
        await deleteFileFromDrive(fileData.fileId);
        console.log(`Deleted Drive file: ${fileData.fileId}`);
      } catch (driveErr) {
        console.log("Drive file might already be deleted:", driveErr.message);
      }
    }

    // 4. Delete from Firestore
    await docRef.delete();
    console.log(`Deleted Firestore doc: ${docId}`);

    res.status(200).send({ message: "Resource deleted successfully" });

  } catch (error) {
    console.error("Delete operation failed:", error);
    res.status(500).send({ message: error.message });
  }
}