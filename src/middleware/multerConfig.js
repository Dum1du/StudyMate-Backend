import multer from "multer";

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

export default upload;