
"use server"

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function getApiKey() {
  return process.env.GEMINI_API_KEY!;
}

export async function analyzeMeal(formData: FormData) {
  const file = formData.get("image") as File;
  if (!file) throw new Error("No image uploaded");

  // Convert File to Base64 for Gemini
  const bytes = await file.arrayBuffer();
  const base64Image = Buffer.from(bytes).toString("base64");

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
    Analyze this food image. 
    1. Identify all items (especially Indian dishes like Dal, Paneer, Roti).
    2. Estimate portions in grams.
    3. Return ONLY a JSON object with this structure:
    {
      "mealName": "string",
      "items": [{"name": "string", "protein": 0, "calories": 0}],
      "totalProtein": 0,
      "totalCalories": 0,
      "insight": "1-sentence tip for muscle hypertrophy"
    }
  `;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64Image, mimeType: file.type } }
  ]);

  return JSON.parse(result.response.text().replace(/```json|```/g, ""));
}