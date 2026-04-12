import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(express.json());
app.use(cors());

// ✅ ENV
const MONGO_URI = process.env.MONGO_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ✅ CONNECT MONGO
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch(err => console.log("Mongo error:", err));

// ✅ SCHEMA
const MemorySchema = new mongoose.Schema({
  category: String,
  content: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
});

const Memory = mongoose.model("Memory", MemorySchema);

// ✅ GEMINI SETUP (STABLE MODEL)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// ✅ SAFE JSON EXTRACT
function extractJSON(text) {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.substring(start, end + 1));
  } catch (err) {
    console.log("JSON parse error:", err);
    return null;
  }
}

// 🚀 MAIN CHAT API
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // 🧠 STEP 1: DECIDE ACTION
    const decisionResult = await model.generateContent(`
You are a personal AI brain.

Classify the input into:
people, finance, plans, medical, notes

Return ONLY JSON (no extra text):
{
 "action": "store" or "retrieve",
 "category": "",
 "data": {},
 "query": ""
}

User input:
"${userMessage}"
`);

    const decisionText = decisionResult.response.text();
    const decision = extractJSON(decisionText);

    if (!decision) {
      return res.json({ reply: "I didn't understand properly 🤔" });
    }

    // 🟢 STORE
    if (decision.action === "store") {
      await Memory.create({
        category: decision.category,
        content: decision.data,
        rawText: userMessage
      });

      return res.json({ reply: "Saved to your brain ✅" });
    }

    // 🔍 RETRIEVE
    if (decision.action === "retrieve") {
      const data = await Memory.find({
        category: decision.category
      }).limit(10);

      const answerResult = await model.generateContent(`
You are a smart assistant.

Answer using this data:
${JSON.stringify(data)}

User question:
"${userMessage}"
`);

      const reply = answerResult.response.text();

      return res.json({ reply });
    }

    return res.json({ reply: "Not sure what to do 🤷" });

  } catch (err) {
    console.log("ERROR:", err);
    return res.json({ reply: "Server error occurred ❌" });
  }
});

// ✅ ROOT CHECK
app.get("/", (req, res) => {
  res.send("AI Brain Running 🚀");
});

// 🚀 START SERVER
app.listen(3000, () => console.log("Server running"));
