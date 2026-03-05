import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";
import {QuizeGenerator} from "./QuizeGenerator.js";
import { admin, db } from "./firebaseConfig.js";


// Helper: split text into word chunks with optional overlap
function splitTextIntoChunks(text, chunkSize = 400, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunk = words.slice(start, end).join(" ");
    chunks.push(chunk);
    start += chunkSize - overlap; // move start with overlap
  }

  return chunks;
}


export async function processPdfAndGenerateQuiz(pdfBuffer, departmentId, documentId) {
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

    let fullText = "";

    // Split pages, limit for safety
    const maxPages = Math.min(pdf.numPages, 15);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      fullText += " " + content.items.map(item => item.str).join(" ");

    }
    const chunks = splitTextIntoChunks(fullText, 400, 50);

    for (const chunk of chunks) {

        const questions = await QuizeGenerator(chunk);

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

      // fs.appendFileSync(`extracted.txt`,`\n--- CHUNK ${index + 1} ---\n${chunk}\n`); // For debugging
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