import { db } from "../firebaseConfig.js";


export const findUploads = async (req, res) => {
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
}