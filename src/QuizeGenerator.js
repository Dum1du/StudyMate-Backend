import dotenv from "dotenv";
import JSON5 from "json5";
import express from "express";
import multer from "multer";

dotenv.config();

export async function QuizeGenerator(pageText) {

  const prompt = `
  Based only on the following page content, generate exactly 2 multiple choice questions.
  
  Rules:
  - 4 options per question
  - Provide correct answer
  - Output **only JSON**, do NOT include code fences or extra text.
  - Output JSON format:
  [
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "answer": "Correct option text"
    }
  ]

  Page Content:
  ${pageText}
  `;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    }),
    timeout: 20000 // 20 seconds timeout
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Gemini API error:", response.status, text);
    throw new Error(`Gemini API error: ${response.status} - ${text}`);
  }

  const data = await response.json();

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error("No text output from Gemini");
  }

  // Clean up the text to ensure it's valid JSON
  const TrimmedText = rawText.trim();

  try{
    const jsonOutPut = JSON5.parse(TrimmedText);

    console.log("Generated Quiz Questions:", jsonOutPut);
    return jsonOutPut;
  }catch(e){
    console.error("Failed to parse Gemini output as JSON:", e);
    throw e;
  }
}