import dotenv from "dotenv";
import express from "express";
import multer from "multer";

export async function QuizeGenerator(pageText) {

  const prompt = `
  Based only on the following page content, generate exactly 5 multiple choice questions.
  
  Rules:
  - 4 options per question
  - Provide correct answer
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

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await response.json();

  const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

  return JSON.parse(textOutput);
}