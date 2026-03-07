import { google } from "googleapis";
import axios from "axios";
import { Readable } from "stream";

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const authClient = await auth.getClient();

//Upload file to Google Drive
const uploadFileToDrive = async (file) => {
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

//Delete file from Google Drive
const deleteFileFromDrive = async (fileId) => {
  if (!fileId) return;

  try {
    const tokenResponse = await authClient.getAccessToken();
    const accessToken = tokenResponse.token;

    await axios.delete(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    console.log(`Deleted Drive file: ${fileId}`);
  } catch (err) {
    console.log("Drive file might already be deleted:", err.message);
  }
}

export { uploadFileToDrive, deleteFileFromDrive };