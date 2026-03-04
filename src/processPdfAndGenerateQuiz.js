import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {QuizeGenerator} from "./QuizeGenerator.js";

export async function processPdfAndGenerateQuiz(pdfBuffer, departmentId, documentId, db) {
  try {
    const materialRef = db
      .collection("studyMaterials")
      .doc(departmentId)
      .collection("Materials")
      .doc(documentId);

    const quizCollectionRef = materialRef.collection("Quizes");

    // Read PDF
    const uint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    // Split pages, limit for safety
    const maxPages = Math.min(pdf.numPages, 15);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      const pageText = content.items.map(item => item.str).join(" ");

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