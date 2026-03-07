import express from "express";
import upload from "../middleware/multerConfig.js";
import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";
import { uploadFile } from "../controllers/uploadController.js";
import { deleteUpload } from "../controllers/deleteController.js";
import { findUploads } from "../controllers/findUploadesController.js";

const router = express.Router();

router.post(
  "/upload",
  verifyFirebaseToken,
  upload.single("file"),
  uploadFile
);

router.delete(
  "/delete-upload/:docId", 
  verifyFirebaseToken, 
  deleteUpload
);

  router.get(
    "/user-uploads", 
    verifyFirebaseToken, 
    findUploads
  );

export default router;