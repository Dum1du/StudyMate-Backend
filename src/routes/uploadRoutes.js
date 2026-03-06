import express from "express";
import upload from "../middleware/multerConfig.js";
import verifyFirebaseToken from "../middleware/verifyFirebaseToken.js";
import { uploadFile } from "../controllers/uploadController.js";

const router = express.Router();

router.post(
  "/upload",
  verifyFirebaseToken,
  upload.single("file"),
  uploadFile
);

export default router;