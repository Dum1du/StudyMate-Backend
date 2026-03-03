import {QuizeGenerator} from "./QuizeGenerator.js";

export async function processPdfAndGenerateQuiz(pdfPath, departmentId, documentId, db) {
  try {
    const materialRef = db
      .collection("studyMaterials")
      .doc(departmentId)
      .collection("Materials")
      .doc(documentId);

    const quizCollectionRef = materialRef.collection("Quizes");

    // Read PDF
    const dataBuffer = await fs.promises.readFile(pdfPath);
    const pdfData = await PDFParse(dataBuffer);

    // Split pages, limit for safety
    const pages = pdfData.text.split("\f").slice(0, 15);

    for (const pageText of pages) {
      const questions = await QuizeGenerator(pageText);
      if (!Array.isArray(questions)) continue;

      // Batch write for performance
      const batch = db.batch();
      for (const q of questions) {
        const newDocRef = quizCollectionRef.doc();
        batch.set(newDocRef, {
          question: q.question,
          options: q.options,
          answer: q.answer,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      await batch.commit();
    }

    // Update final status to ready
    await materialRef.update({
      quizStatus: "ready"
    });

  } catch (err) {
    console.error("Quiz generation error:", err);
    await db
      .collection("studyMaterials")
      .doc(departmentId)
      .collection("Materials")
      .doc(documentId)
      .update({
        quizStatus: "failed"
      });
  }
}