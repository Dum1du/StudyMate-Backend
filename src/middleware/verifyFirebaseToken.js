import { admin } from "../firebaseConfig.js";

export default async function verifyFirebaseToken(req, res, next) {

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send("Missing token");
  }

  try {

    const token = authHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);

    req.user = decoded;

    next();

  } catch (error) {

    res.status(401).send("Unauthorized");

  }
}