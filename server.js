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

// ✅ CONNECT DB
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch(err => console.log("Mongo Error:", err));

// ✅ SCHEMA
const MemorySchema = new mongoose.Schema({
  category: String,
  content: Object,
  rawText: String,
  createdAt: { type: Date, default: Date.now }
});

const Memory = mongoose.model("Memory", MemorySchema);

// ✅ GEMINI SETUP (WORKING MODEL)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ✅ SAFE AI CALL
async function askAI(prompt) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp"
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  });

  return result.response.text();
}

// ✅ SAFE JSON PARSER
function extractJSON(text) {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.substring(start, end + 1));
  } catch (err) {
    console.log("JSON Error:", err);
    return null;
  }
}

// 🚀 MAIN API
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // 🧠 DECIDE ACTION
    const decisionText = await askAI(`
You are a personal AI brain.

Classify into:
people, finance, plans, medical, notes

Return ONLY JSON:
{
 "action": "store" or "retrieve",
 "category": "",
 "data": {},
 "query": ""
}

User input:
"${userMessage}"
`);

    const decision = extractJSON(decisionText);

    if (!decision) {
      return res.json({ reply: "Couldn't understand 🤔" });
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

      const answer = await askAI(`
Answer clearly using this data:
${JSON.stringify(data)}

User question:
"${userMessage}"
`);

      return res.json({ reply: answer });
    }

    return res.json({ reply: "Not sure what to do 🤷" });

  } catch (err) {
    console.log("FULL ERROR:", err);
    return res.json({ reply: "Error: " + err.message });
  }
});

// ✅ ROOT
app.get("/", (req, res) => {
  res.send("AI Brain Running 🚀");
});

// 🚀 START
app.listen(3000, () => console.log("Server running"));
